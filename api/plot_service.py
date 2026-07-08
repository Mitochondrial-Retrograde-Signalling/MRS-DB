"""Plot generation functions — ported from test.ipynb."""
from __future__ import annotations

import base64
import io
import json
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional

import matplotlib
matplotlib.use("Agg")  # Non-interactive backend — MUST be set before importing pyplot

import matplotlib as mpl
import matplotlib.pyplot as plt
import matplotlib.ticker as ticker
import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import seaborn as sns
from anndata import AnnData

logger = logging.getLogger(__name__)

# ── Constants (from test.ipynb) ──────────────────────────────────────────────
NA_CUTOFF = 1e-09
NA_COLOR = "lightgray"
DOT_SCALE = 8
VIRIDIS_OPTION = "viridis"


# ── Dotplot ──────────────────────────────────────────────────────────────────

def generate_dotplot(
    adata: AnnData,
    genes: list[str],
    gene_labels: Optional[dict[str, str]] = None,
) -> dict:
    """Generate a faceted dotplot as a base64-encoded PNG.

    Args:
        adata: AnnData object (already subset by timepoint).
        genes: List of GeneNames (1-10) matching adata.var_names.
        gene_labels: Optional mapping from GeneName → display label,
            e.g. {'RPS19.1': 'ATCG00820 (RPS19.1)'}. Falls back to GeneName.

    Returns:
        Dict with keys: image (base64 str), format ("png"), width, height.
    """

    # Verify all genes exist
    missing = [g for g in genes if g not in adata.var_names]
    if missing:
        raise ValueError(f"Gene(s) not found: {', '.join(missing)}")

    # ── Build the plot data (from test.ipynb Cell 7: facet_dot_plot) ──
    expr_matrix = adata[:, genes].to_df()
    metadata = adata.obs[["celltype", "group"]].copy()
    df = pd.concat([expr_matrix, metadata], axis=1)

    df_long = df.melt(
        id_vars=["celltype", "group"],
        value_vars=genes,
        var_name="gene",
        value_name="expr",
    )

    # Apply gene display labels if provided
    if gene_labels:
        df_long["gene"] = df_long["gene"].map(lambda g: gene_labels.get(g, g))

    plot_data = (
        df_long.groupby(["celltype", "group", "gene"])
        .agg(
            avg_exp=("expr", "mean"),
            pct_exp=("expr", lambda x: (x > 0).mean() * 100),
        )
        .reset_index()
    )

    groups = sorted(plot_data["group"].unique())
    ncol = min(4, len(groups))

    g = sns.FacetGrid(
        plot_data,
        col="group",
        col_wrap=ncol,
        margin_titles=True,
        height=4,
        aspect=1,
    )

    def scatter_mapping(data, **kwargs):
        return plt.scatter(
            x=data["celltype"],
            y=data["gene"],
            s=data["pct_exp"] * (DOT_SCALE ** 2 / 100),
            c=data["avg_exp"],
            cmap=VIRIDIS_OPTION,
            edgecolors="none",
        )

    g.map_dataframe(scatter_mapping)

    for ax in g.axes.flat:
        ax.set_xticklabels(ax.get_xticklabels(), rotation=90, ha="center")
        ax.grid(False)
        ax.set_facecolor("white")
        for spine in ax.spines.values():
            spine.set_color("black")
            spine.set_visible(True)

    path_coll = g.axes[0].collections[0] if g.axes[0].collections else None
    if path_coll:
        cbar_ax = g.figure.add_axes([1.02, 0.3, 0.02, 0.4])
        plt.colorbar(path_coll, cax=cbar_ax, label="Average\nexpression")

    g.set_axis_labels("", "")
    g.set_titles(col_template="{col_name}")

    fig = g.figure
    fig.tight_layout()

    # ── Render to base64 PNG ──
    # dpi=96 matches typical screen resolution; frontend uses CSS max-width so
    # exact pixel dimensions are irrelevant — PIL double-decode removed.
    _DPI = 96
    w_in, h_in = fig.get_size_inches()
    width = int(round(w_in * _DPI))
    height = int(round(h_in * _DPI))

    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=_DPI, bbox_inches="tight")
    plt.close(fig)
    buf.seek(0)
    b64 = base64.b64encode(buf.read()).decode("utf-8")

    return {
        "plotType": "dotplot",
        "image": b64,
        "format": "png",
        "width": width,
        "height": height,
    }


# ── UMAP Feature Plot ────────────────────────────────────────────────────────

def _build_group_traces(
    group_name: str,
    group_mask: np.ndarray,
    all_expr: np.ndarray,
    all_umap: np.ndarray,
    display_name: str,
    row: int,
    col: int,
    is_last_group: bool,
) -> tuple[int, int, int, Optional[go.Scatter], Optional[go.Scatter]]:
    """Build NA + valid-expression traces for a single group (thread-safe).

    All inputs are raw numpy arrays — no AnnData interaction inside this
    function, so it's safe to call from multiple threads (numpy releases
    the GIL during arithmetic).

    Returns:
        Tuple of (group_index, row, col, na_trace_or_None, valid_trace).
    """
    expr_values = all_expr[group_mask]
    umap_coords = all_umap[group_mask]

    na_mask = expr_values <= NA_CUTOFF
    valid_mask = ~na_mask

    # ── NA trace (solid lightgray, rendered behind valid points) ──
    na_trace = None
    if na_mask.any():
        na_trace = go.Scatter(
            x=umap_coords[na_mask, 0],
            y=umap_coords[na_mask, 1],
            mode="markers",
            marker=dict(size=3, color=NA_COLOR),
            name=f"{group_name} (NA)",
            showlegend=False,
            hovertemplate=(
                f"UMAP1: %{{x:.2f}}<br>"
                f"UMAP2: %{{y:.2f}}<br>"
                f"{display_name}: ≤ {NA_CUTOFF}<br>"
                f"Group: {group_name}<extra></extra>"
            ),
        )

    # ── Valid-expression trace (Plasma_r colorscale) ──
    valid_expr = expr_values[valid_mask]
    has_valid = valid_mask.any()

    valid_trace = go.Scatter(
        x=umap_coords[valid_mask, 0],
        y=umap_coords[valid_mask, 1],
        mode="markers",
        marker=dict(
            size=3,
            color=valid_expr if has_valid else None,
            colorscale="Plasma_r",
            colorbar=dict(title="Expression") if is_last_group else None,
            cmin=np.nanmin(valid_expr) if has_valid else 0,
            cmax=np.nanmax(valid_expr) if has_valid else 1,
            showscale=is_last_group,
        ),
        name=group_name,
        hovertemplate=(
            f"UMAP1: %{{x:.2f}}<br>"
            f"UMAP2: %{{y:.2f}}<br>"
            f"{display_name}: %{{marker.color:.4f}}<br>"
            f"Group: {group_name}<extra></extra>"
        ),
    )

    return (row, col, na_trace, valid_trace)


def generate_umap(
    adata: AnnData,
    gene: str,
    gene_label: Optional[str] = None,
) -> dict:
    """Generate a UMAP feature plot as Plotly JSON (interactive).

    Optimized with two strategies:
      1. Pre-compute: extract expression, UMAP coords, and group labels
         for all cells in a single pass (avoids expensive per-group
         AnnData subsetting / reindexing).
      2. Multi-threaded trace building: use ThreadPoolExecutor to build
         Plotly Scatter traces in parallel (numpy releases the GIL during
         masking + arithmetic).  Figure mutation is still single-threaded.

    Args:
        adata: AnnData object (already subset by timepoint).
        gene: Single GeneName matching adata.var_names to color by.
        gene_label: Optional display label for the gene, e.g. 'ATCG00820 (RPS19.1)'.
            Falls back to `gene` if not provided.

    Returns:
        Dict with keys: data (Plotly figure JSON), format ("plotly_json").
    """
    if gene not in adata.var_names:
        raise ValueError(f"Gene '{gene}' not found in dataset")

    display_name = gene_label if gene_label else gene

    # ── Pre-compute all data ONCE (avoid per-group AnnData subsetting) ──
    all_expr = adata.obs_vector(gene).astype(float)
    all_umap = adata.obsm["X_umap"]
    all_groups = adata.obs["group"].values  # numpy array, fast boolean indexing

    unique_groups = sorted(adata.obs["group"].unique())
    n_groups = len(unique_groups)

    # ── Build Plotly subplots (one per group) using make_subplots ──
    ncols = min(n_groups, 4)
    nrows = int(np.ceil(n_groups / ncols))

    subplot_titles = [f"{display_name} - {g}" for g in unique_groups]

    fig = make_subplots(
        rows=nrows,
        cols=ncols,
        subplot_titles=subplot_titles,
    )

    # ── Build traces in parallel (ThreadPoolExecutor) ──
    # numpy masking / boolean indexing releases the GIL, so threading
    # gives real speedup for compute-bound trace construction.
    max_workers = min(n_groups, 4)
    futures: dict = {}

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        for i, group_name in enumerate(unique_groups):
            group_mask = all_groups == group_name
            row = i // ncols + 1
            col = i % ncols + 1
            is_last = i == n_groups - 1

            future = executor.submit(
                _build_group_traces,
                group_name,
                group_mask,
                all_expr,
                all_umap,
                display_name,
                row,
                col,
                is_last,
            )
            futures[future] = i  # preserve original ordering

        # ── Add traces to figure (single-threaded — Plotly is not thread-safe) ──
        # Collect results and sort by original group index
        results = []
        for future in as_completed(futures):
            results.append(future.result())

        # Sort by original group order (row, col)
        results.sort(key=lambda r: (r[0], r[1]))

        for row, col, na_trace, valid_trace in results:
            if na_trace is not None:
                fig.add_trace(na_trace, row=row, col=col)
            fig.add_trace(valid_trace, row=row, col=col)

    # ── Layout ──
    fig.update_layout(
        title=f"UMAP — {display_name}",
        showlegend=False,
        hovermode="closest",
        template="plotly_white",
    )

    # Use fig.to_json() to get proper JSON-serializable dict
    # (fig.to_dict() contains numpy scalars that FastAPI cannot serialize)
    return {
        "plotType": "umap",
        "data": json.loads(fig.to_json()),
        "format": "plotly_json",
    }
