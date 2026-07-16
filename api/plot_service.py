"""Plot generation functions — ported from test.ipynb."""
from __future__ import annotations

import base64
import io
import logging
from typing import Optional

import matplotlib
matplotlib.use("Agg")  # Non-interactive backend — MUST be set before importing pyplot

import matplotlib as mpl
import matplotlib.pyplot as plt
import matplotlib.ticker as ticker
import numpy as np
import pandas as pd
import seaborn as sns
from anndata import AnnData

logger = logging.getLogger(__name__)

# ── Constants (from test.ipynb) ──────────────────────────────────────────────
NA_CUTOFF = 1e-09
NA_COLOR = "lightgray"
DOT_SCALE = 8
VIRIDIS_OPTION = "viridis"

# ── Group display label remapping ────────────────────────────────────────────
GROUP_LABEL_MAP: dict[str, str] = {
    "Col0_AA":    "Col-0 AA",
    "Col0_Mock":  "Col-0 Mock",
    "nac17_AA":   "anac017 KO-1 AA",
    "nac17_Mock": "anac017 KO-1 Mock",
}


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

    # Apply group display labels
    df_long["group"] = df_long["group"].map(lambda g: GROUP_LABEL_MAP.get(g, g))

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
        cbar = plt.colorbar(path_coll, cax=cbar_ax, label="Average\nexpression")
        cbar.ax.yaxis.set_major_formatter(ticker.FormatStrFormatter('%.1f'))

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


def generate_umap(
    adata: AnnData,
    gene: str,
    gene_label: Optional[str] = None,
    highlight_by: Optional[str] = None,
    highlight_values: Optional[list[str]] = None,
) -> dict:
    """Generate a UMAP feature plot colored by expression, with optional cell highlighting.

    Args:
        adata: AnnData object (already subset by timepoint).
        gene: Single GeneName matching adata.var_names.
        gene_label: Optional display label shown as the plot title.
        highlight_by: Optional category to highlight; one of "celltype" or "cluster".
            Non-highlighted cells are drawn in NA_COLOR at alpha=0.12.
            None or "none" means no highlighting (all cells at full opacity).
        highlight_values: List of category values to highlight within ``highlight_by``.
            Empty list or None disables highlighting even when ``highlight_by`` is set.

    Returns:
        Dict with keys: image (base64 str), format ("png"), width, height.
    """
    if gene not in adata.var_names:
        raise ValueError(f"Gene '{gene}' not found in dataset")

    _do_highlight = (
        highlight_by in ("celltype", "cluster")
        and bool(highlight_values)
    )

    if _do_highlight:
        obs_key = "celltype" if highlight_by == "celltype" else "seurat_clusters"
        if obs_key not in adata.obs.columns:
            raise ValueError(f"Column '{obs_key}' not found in adata.obs")

    display_name = gene_label if gene_label else gene

    all_umap = adata.obsm["X_umap"]
    all_groups = adata.obs["group"].values

    unique_groups = sorted(adata.obs["group"].unique())
    n_groups = len(unique_groups)
    ncols = min(n_groups, 4)
    nrows = int(np.ceil(n_groups / ncols))

    figw = ncols * 3.5
    figh = nrows * 3.5
    fig, axes = plt.subplots(nrows, ncols, figsize=(figw, figh), squeeze=False)

    # ── Always: expression color mode ────────────────────────────────────────
    all_expr = adata.obs_vector(gene).astype(float)

    # Global vmin/vmax across all groups for a consistent colorbar
    valid_expr_all = all_expr[all_expr > NA_CUTOFF]
    vmin = float(np.nanmin(valid_expr_all)) if valid_expr_all.size > 0 else 0.0
    vmax = float(np.nanmax(valid_expr_all)) if valid_expr_all.size > 0 else 1.0

    cmap = plt.cm.plasma_r
    norm = mpl.colors.Normalize(vmin=vmin, vmax=vmax)

    # Build global boolean mask for highlighted cells (True = highlighted)
    if _do_highlight:
        obs_series = adata.obs[obs_key].astype(str)
        global_highlight_mask = obs_series.isin([str(v) for v in highlight_values]).values
    else:
        global_highlight_mask = None

    _DIMMED_ALPHA = 0.12
    _DIMMED_COLOR = NA_COLOR  # "lightgray"

    scatter_ref = None
    for i, group_name in enumerate(unique_groups):
        row, col = divmod(i, ncols)
        ax = axes[row][col]

        group_mask = all_groups == group_name
        expr = all_expr[group_mask]
        coords = all_umap[group_mask]

        na_mask = expr <= NA_CUTOFF
        valid_mask = ~na_mask

        if global_highlight_mask is not None:
            # Per-group highlight mask (True = this cell is highlighted)
            group_indices = np.where(group_mask)[0]
            in_hi = global_highlight_mask[group_indices]
            not_hi = ~in_hi

            # 1. Dimmed non-highlighted cells (gray, very low alpha)
            if not_hi.any():
                ax.scatter(
                    coords[not_hi, 0], coords[not_hi, 1],
                    s=2, c=_DIMMED_COLOR, alpha=_DIMMED_ALPHA,
                    linewidths=0, rasterized=True,
                )

            # 2. Highlighted cells: NA as gray, expressed with expression colormap
            hi_na = na_mask & in_hi
            hi_valid = valid_mask & in_hi
            if hi_na.any():
                ax.scatter(
                    coords[hi_na, 0], coords[hi_na, 1],
                    s=2, c=NA_COLOR, linewidths=0, rasterized=True,
                )
            if hi_valid.any():
                scatter_ref = ax.scatter(
                    coords[hi_valid, 0], coords[hi_valid, 1],
                    s=2, c=expr[hi_valid], cmap=cmap, norm=norm,
                    linewidths=0, rasterized=True,
                )
        else:
            # No highlighting — standard expression rendering
            if na_mask.any():
                ax.scatter(
                    coords[na_mask, 0], coords[na_mask, 1],
                    s=2, c=NA_COLOR, linewidths=0, rasterized=True,
                )
            if valid_mask.any():
                scatter_ref = ax.scatter(
                    coords[valid_mask, 0], coords[valid_mask, 1],
                    s=2, c=expr[valid_mask], cmap=cmap, norm=norm,
                    linewidths=0, rasterized=True,
                )

        ax.set_title(GROUP_LABEL_MAP.get(group_name, group_name), fontsize=9)
        ax.set_xlabel("UMAP1", fontsize=7)
        ax.set_ylabel("UMAP2", fontsize=7)
        ax.tick_params(labelsize=6)

    # Hide unused subplot panels
    for i in range(n_groups, nrows * ncols):
        row, col = divmod(i, ncols)
        axes[row][col].set_visible(False)

    # Title: gene name, optionally appended with highlight annotation
    title = display_name
    if _do_highlight and highlight_values:
        joined = ", ".join(str(v) for v in highlight_values[:3])
        suffix = f" + {len(highlight_values) - 3} more" if len(highlight_values) > 3 else ""
        title = f"{display_name}  [highlight: {joined}{suffix}]"
    fig.suptitle(title, fontsize=11, fontweight="bold")

    # Colorbar — reserve 12% on the right so subplots never overlap it
    plt.tight_layout(rect=[0, 0, 0.88, 1.0])
    if scatter_ref is not None:
        cbar_ax = fig.add_axes([0.90, 0.15, 0.02, 0.70])
        cbar = fig.colorbar(scatter_ref, cax=cbar_ax, label="Expression level")
        cbar.ax.yaxis.set_major_formatter(ticker.FormatStrFormatter('%.1f'))

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
        "plotType": "umap",
        "image": b64,
        "format": "png",
        "width": width,
        "height": height,
    }


# ── UMAP Category Metadata ───────────────────────────────────────────────────


def get_umap_categories(adata: AnnData) -> dict:
    """Return sorted lists of available celltype and cluster values from an AnnData object.

    Args:
        adata: AnnData object for a single timepoint.

    Returns:
        Dict with keys:
            celltypes: sorted list of strings from adata.obs["celltype"] ([] if column absent).
            clusters:  numerically sorted list of strings from adata.obs["seurat_clusters"]
                       ([] if column absent).
    """
    celltypes: list[str] = []
    if "celltype" in adata.obs.columns:
        obs_series = adata.obs["celltype"]
        if hasattr(obs_series, "cat"):
            celltypes = [str(c) for c in obs_series.cat.categories.tolist()]
        else:
            celltypes = sorted([str(c) for c in obs_series.unique().tolist()], key=str)

    clusters: list[str] = []
    if "seurat_clusters" in adata.obs.columns:
        raw_cats = adata.obs["seurat_clusters"].unique().tolist()
        try:
            clusters = [str(c) for c in sorted(raw_cats, key=int)]
        except (ValueError, TypeError):
            clusters = sorted([str(c) for c in raw_cats])

    return {"celltypes": celltypes, "clusters": clusters}
