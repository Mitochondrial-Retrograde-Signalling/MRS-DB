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
    cell_types: list[str],
    genotypes: list[str],
) -> dict:
    """Generate a faceted dotplot as a base64-encoded PNG.

    Args:
        adata: AnnData object (already subset by timepoint).
        genes: List of gene symbols (1-10).
        cell_types: Cell types to include (filters adata.obs['celltype']).
        genotypes: Genotypes/groups to include (filters adata.obs['group'],
            used as split_by for faceting).

    Returns:
        Dict with keys: image (base64 str), format ("png"), width, height.
    """
    # Subset by cell type and genotype
    mask = (
        adata.obs["celltype"].isin(cell_types)
        & adata.obs["group"].isin(genotypes)
    )
    adata_sub = adata[mask].copy()

    if adata_sub.n_obs == 0:
        raise ValueError("No observations remain after filtering by cell type and genotype")

    # Verify all genes exist
    missing = [g for g in genes if g not in adata.var_names]
    if missing:
        raise ValueError(f"Gene(s) not found: {', '.join(missing)}")

    # ── Build the plot data (from test.ipynb Cell 7: facet_dot_plot) ──
    expr_matrix = adata_sub[:, genes].to_df()
    metadata = adata_sub.obs[["celltype", "group"]].copy()
    df = pd.concat([expr_matrix, metadata], axis=1)

    df_long = df.melt(
        id_vars=["celltype", "group"],
        value_vars=genes,
        var_name="gene",
        value_name="expr",
    )

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
    cell_types: list[str],
    genotypes: list[str],
) -> dict:
    """Generate a UMAP feature plot as Plotly JSON (interactive).

    Args:
        adata: AnnData object (already subset by timepoint).
        gene: Single gene symbol to color by.
        cell_types: Cell types to include.
        genotypes: Genotypes/groups to include (each gets its own subplot).

    Returns:
        Dict with keys: data (Plotly figure JSON), format ("plotly_json").
    """
    if gene not in adata.var_names:
        raise ValueError(f"Gene '{gene}' not found in dataset")

    # Subset by cell type and genotype
    mask = (
        adata.obs["celltype"].isin(cell_types)
        & adata.obs["group"].isin(genotypes)
    )
    adata_base = adata[mask].copy()

    if adata_base.n_obs == 0:
        raise ValueError("No observations remain after filtering")

    unique_groups = sorted(adata_base.obs["group"].unique())

    # ── Build Plotly subplots (one per group) using make_subplots ──
    ncols = min(len(unique_groups), 4)
    nrows = int(np.ceil(len(unique_groups) / ncols))

    subplot_titles = [f"{gene} - {g}" for g in unique_groups]

    fig = make_subplots(
        rows=nrows,
        cols=ncols,
        subplot_titles=subplot_titles,
    )

    for i, group_name in enumerate(unique_groups):
        adata_sub = adata_base[adata_base.obs["group"] == group_name].copy()

        # Pull expression values and mask low values (from test.ipynb Cell 9)
        expr_values = adata_sub.obs_vector(gene).astype(float)
        expr_values[expr_values <= NA_CUTOFF] = np.nan

        umap_coords = adata_sub.obsm["X_umap"]

        row = i // ncols + 1
        col = i % ncols + 1

        trace = go.Scatter(
            x=umap_coords[:, 0],
            y=umap_coords[:, 1],
            mode="markers",
            marker=dict(
                size=3,
                color=expr_values,
                colorscale="Plasma_r",
                colorbar=dict(title="Expression") if i == len(unique_groups) - 1 else None,
                cmin=np.nanmin(expr_values) if not np.all(np.isnan(expr_values)) else 0,
                cmax=np.nanmax(expr_values) if not np.all(np.isnan(expr_values)) else 1,
                showscale=(i == len(unique_groups) - 1),
            ),
            name=group_name,
            hovertemplate=(
                f"UMAP1: %{{x:.2f}}<br>"
                f"UMAP2: %{{y:.2f}}<br>"
                f"{gene}: %{{marker.color:.4f}}<br>"
                f"Group: {group_name}<extra></extra>"
            ),
        )

        fig.add_trace(trace, row=row, col=col)

    # ── Layout ──
    fig.update_layout(
        title=f"UMAP — {gene}",
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
