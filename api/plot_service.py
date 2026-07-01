"""Plot generation functions — ported from test.ipynb."""
from __future__ import annotations

import base64
import io
import json
import logging
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
from PIL import Image

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
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=150, bbox_inches="tight")
    plt.close(fig)
    buf.seek(0)

    img = Image.open(buf)
    width, height = img.size

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

def generate_umap(
    adata: AnnData,
    gene: str,
    gene_label: Optional[str] = None,
) -> dict:
    """Generate a UMAP feature plot as Plotly JSON (interactive).

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

    unique_groups = sorted(adata.obs["group"].unique())

    # ── Build Plotly subplots (one per group) using make_subplots ──
    ncols = min(len(unique_groups), 4)
    nrows = int(np.ceil(len(unique_groups) / ncols))

    subplot_titles = [f"{display_name} - {g}" for g in unique_groups]

    fig = make_subplots(
        rows=nrows,
        cols=ncols,
        subplot_titles=subplot_titles,
    )

    for i, group_name in enumerate(unique_groups):
        adata_sub = adata[adata.obs["group"] == group_name].copy()

        # Pull expression values (from test.ipynb Cell 9)
        expr_values = adata_sub.obs_vector(gene).astype(float)

        umap_coords = adata_sub.obsm["X_umap"]

        row = i // ncols + 1
        col = i % ncols + 1

        # Split into NA (low-expression) and valid points, matching
        # test.ipynb behaviour where cmap.set_bad(color=na_color) renders
        # NaN cells as lightgray.
        na_mask = expr_values <= NA_CUTOFF
        valid_mask = ~na_mask

        # ── NA trace (solid lightgray, rendered behind valid points) ──
        if na_mask.any():
            na_trace = go.Scatter(
                x=umap_coords[na_mask, 0],
                y=umap_coords[na_mask, 1],
                mode="markers",
                marker=dict(
                    size=3,
                    color=NA_COLOR,
                ),
                name=f"{group_name} (NA)",
                showlegend=False,
                hovertemplate=(
                    f"UMAP1: %{{x:.2f}}<br>"
                    f"UMAP2: %{{y:.2f}}<br>"
                    f"{display_name}: ≤ {NA_CUTOFF}<br>"
                    f"Group: {group_name}<extra></extra>"
                ),
            )
            fig.add_trace(na_trace, row=row, col=col)

        # ── Valid-expression trace (Plasma_r colorscale) ──
        valid_expr = expr_values[valid_mask]
        has_valid = valid_mask.any()

        trace = go.Scatter(
            x=umap_coords[valid_mask, 0],
            y=umap_coords[valid_mask, 1],
            mode="markers",
            marker=dict(
                size=3,
                color=valid_expr if has_valid else None,
                colorscale="Plasma_r",
                colorbar=dict(title="Expression") if i == len(unique_groups) - 1 else None,
                cmin=np.nanmin(valid_expr) if has_valid else 0,
                cmax=np.nanmax(valid_expr) if has_valid else 1,
                showscale=(i == len(unique_groups) - 1),
            ),
            name=group_name,
            hovertemplate=(
                f"UMAP1: %{{x:.2f}}<br>"
                f"UMAP2: %{{y:.2f}}<br>"
                f"{display_name}: %{{marker.color:.4f}}<br>"
                f"Group: {group_name}<extra></extra>"
            ),
        )

        fig.add_trace(trace, row=row, col=col)

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
