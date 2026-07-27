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
import colorsys as _colorsys
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

# ── Cell type abbreviations for dot plot x-axis ───────────────────────────────
CELLTYPE_ABBREV: dict[str, str] = {
    "Bundle sheath":                "BS",
    "Companion cell":               "CC",
    "Epidermis":                    "EP",
    "G2/M phase":                   "G2M",
    "Guard cell&Myrosin idioblasts": "LGC&MI",
    "Guard cell":                   "LGC",
    "Mesophyll":                    "ME",
    "Phloem parenchyma":            "PP",
    "Phloem parenchyma and Xylem":  "PPX",
    "S phase":                      "SP",
    "Trichome":                     "TRI",
    "Unknown":                      "UK",
    "Xylem":                        "XYL",
}

GENOTYPE_TREATMENT_FOOTNOTE = (
    "Genotypes: Col-0 (wild type); anac017 KO-1 (knockout).  "
    "Treatments: AA (antimycin A-treated); Mock (mock control)."
)


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

    # Scale height with number of genes so dots don't get cramped;
    # keep facet width fixed by adjusting aspect = fixed_width / facet_height.
    n_genes = len(genes)
    facet_width = 4.0  # inches — constant regardless of gene count
    facet_height = 2.5 + n_genes * 0.5  # 3.0 for 1 gene, 3.5 for 2, +0.5 per gene
    facet_aspect = facet_width / facet_height

    g = sns.FacetGrid(
        plot_data,
        col="group",
        col_wrap=ncol,
        margin_titles=True,
        height=facet_height,
        aspect=facet_aspect,
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
        labels = [t.get_text() for t in ax.get_xticklabels()]
        abbrev_labels = [CELLTYPE_ABBREV.get(lbl, lbl) for lbl in labels]
        ax.set_xticklabels(abbrev_labels, rotation=90, ha="center")
        ax.grid(False)
        ax.set_facecolor("white")
        for spine in ax.spines.values():
            spine.set_color("black")
            spine.set_visible(True)
        # Fixed 0.5-slot padding top and bottom regardless of gene count
        ax.margins(y=0)
        ymin, ymax = ax.get_ylim()
        ax.set_ylim(ymin - 0.25, ymax + 0.25)

    path_coll = g.axes[0].collections[0] if g.axes[0].collections else None
    cbar_ax = None
    if path_coll:
        cbar_ax = g.figure.add_axes([1.02, 0.52, 0.02, 0.35])
        cbar = plt.colorbar(path_coll, cax=cbar_ax, label="Average\nexpression")
        cbar.ax.yaxis.set_major_formatter(ticker.FormatStrFormatter('%.1f'))

    # Add size legend for dot sizes (percent expressed).
    # When a colorbar exists, anchor the size legend just below it using the
    # colorbar's own axes transform so the gap is always proportional and
    # never overlaps regardless of figure height.
    size_pct_values = [25, 50, 75, 100]
    size_handles = []
    for pct in size_pct_values:
        handle = plt.scatter(
            [], [],
            s=pct * (DOT_SCALE ** 2 / 100),
            c='gray', edgecolors='none', alpha=0.7
        )
        size_handles.append(handle)

    if cbar_ax is not None:
        size_legend_kwargs = dict(
            loc='upper left',
            bbox_to_anchor=(0.0, -0.08),   # 8 % of colorbar height below its bottom
            bbox_transform=cbar_ax.transAxes,
        )
    else:
        size_legend_kwargs = dict(
            loc='lower left',
            bbox_to_anchor=(1.02, 0.0),
        )

    g.figure.legend(
        size_handles,
        [f"{p}%" for p in size_pct_values],
        title="Percent\nexpressed",
        frameon=False,
        scatterpoints=1,
        handletextpad=1.5,
        alignment='left',
        **size_legend_kwargs,
    )

    g.set_axis_labels("", "")
    g.set_titles(col_template="{col_name}")

    fig = g.figure

    # ── Footnote: abbreviation key for x-axis labels ──
    celltypes_present = sorted(plot_data["celltype"].unique())
    footnote_parts = [
        f"{CELLTYPE_ABBREV[ct]}: {ct}"
        for ct in celltypes_present
        if ct in CELLTYPE_ABBREV
    ]
    footnote_text = ""
    if footnote_parts:
        n_per_line = 6
        lines = [
            "; ".join(footnote_parts[i : i + n_per_line])
            for i in range(0, len(footnote_parts), n_per_line)
        ]
        footnote_text = "\n".join(lines)

    # Reserve bottom margin inside the figure so the footnote doesn't push
    # bbox_inches="tight" to expand the output height.
    n_footnote_lines = footnote_text.count("\n") + 1 if footnote_text else 0
    n_footnote_lines += 1  # genotype/treatment line
    bottom_margin = 0.03 + n_footnote_lines * 0.04  # ~0.04 per line at fig scale
    fig.tight_layout(rect=[0, bottom_margin, 1, 1])

    if footnote_text:
        fig.text(
            0.0, bottom_margin - 0.01,
            "\n" + footnote_text + "\n" + GENOTYPE_TREATMENT_FOOTNOTE,
            ha="left", va="top",
            fontsize=9, style="italic", color="#444444",
        )


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
    plt.tight_layout(rect=[0, 0.05, 0.88, 1.0])
    if scatter_ref is not None:
        cbar_ax = fig.add_axes([0.90, 0.15, 0.02, 0.70])
        cbar = fig.colorbar(scatter_ref, cax=cbar_ax, label="Expression level")
        cbar.ax.yaxis.set_major_formatter(ticker.FormatStrFormatter('%.1f'))

    fig.text(
        0, 0.005,
        GENOTYPE_TREATMENT_FOOTNOTE,
        ha="left", va="top",
        fontsize=9, style="italic", color="#444444",
    )

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


def _ggplot_hue_palette(n: int) -> list[tuple[float, float, float]]:
    """Replicate ggplot2 hue_pal()(n) — evenly-spaced hues, lightness=0.65, saturation=0.65."""
    if n == 0:
        return []
    hues = [i / n for i in range(n)]
    return [_colorsys.hls_to_rgb(h, 0.65, 0.65) for h in hues]


def generate_umap_coloring(
    adata: AnnData,
    color_by: str,
) -> dict:
    """Generate a UMAP plot with cells colored by a categorical variable.

    Used to render the side-by-side 'Cell Type & Cluster Reference' box in
    the frontend.  Produces the same group-panel layout as ``generate_umap``
    but colors cells by category label rather than expression level.

    Args:
        adata: AnnData object (already subset by timepoint).
        color_by: ``"celltype"`` → color by ``adata.obs["celltype"]``;
                  ``"cluster"``  → color by ``adata.obs["seurat_clusters"]``.

    Returns:
        Dict with keys: plotType, color_by, image (base64 PNG), format, width, height.

    Raises:
        ValueError: if ``color_by`` is invalid or the required obs column is absent.
    """
    if color_by == "celltype":
        obs_key = "celltype"
        legend_title = "Cell type"
    elif color_by == "cluster":
        obs_key = "seurat_clusters"
        legend_title = "Cluster"
    else:
        raise ValueError(f"color_by must be 'celltype' or 'cluster', got '{color_by}'")

    if obs_key not in adata.obs.columns:
        raise ValueError(f"Column '{obs_key}' not found in adata.obs")

    # ── Build category → color mapping ───────────────────────────────────────
    obs_series = adata.obs[obs_key].astype(str)
    if color_by == "cluster":
        raw_cats = obs_series.unique().tolist()
        try:
            categories = [str(c) for c in sorted(raw_cats, key=int)]
        except (ValueError, TypeError):
            categories = sorted(raw_cats)
    else:
        if hasattr(adata.obs[obs_key], "cat"):
            categories = [str(c) for c in adata.obs[obs_key].cat.categories.tolist()]
        else:
            categories = sorted(obs_series.unique().tolist())

    n_cats = len(categories)
    palette = _ggplot_hue_palette(n_cats)
    cat_to_color: dict[str, tuple] = {cat: palette[i] for i, cat in enumerate(categories)}

    # ── Use only the first group ──────────────────────────────────────────────
    all_umap = adata.obsm["X_umap"]
    all_groups = adata.obs["group"].values
    all_cat_vals = obs_series.values  # string array

    unique_groups = sorted(adata.obs["group"].unique())
    first_group = unique_groups[0]
    group_mask = all_groups == first_group
    coords = all_umap[group_mask]
    cat_vals = all_cat_vals[group_mask]

    # ── Single plot ───────────────────────────────────────────────────────────
    fig, ax = plt.subplots(1, 1, figsize=(4, 4))

    for cat in categories:
        mask = cat_vals == cat
        if not mask.any():
            continue
        ax.scatter(
            coords[mask, 0],
            coords[mask, 1],
            s=2,
            c=[cat_to_color[cat]],
            linewidths=0,
            rasterized=True,
            label=cat,
        )

    # ax.set_title(GROUP_LABEL_MAP.get(first_group, first_group), fontsize=9)
    ax.set_xlabel("UMAP1", fontsize=7)
    ax.set_ylabel("UMAP2", fontsize=7)
    ax.tick_params(labelsize=6)

    if color_by == "cluster":
        # Overlay cluster number labels at centroids (like legend_loc="on data" in scanpy)
        import matplotlib.patheffects as _pe
        for cat in categories:
            mask = cat_vals == cat
            if not mask.any():
                continue
            cx = float(coords[mask, 0].mean())
            cy = float(coords[mask, 1].mean())
            ax.text(
                cx, cy, cat,
                fontsize=8,
                fontweight="bold",
                ha="center",
                va="center",
                color="black",
                path_effects=[_pe.withStroke(linewidth=2, foreground="white")],
            )
        plt.tight_layout()
    else:
        # celltype: legend to the right of the plot
        handles = [
            plt.Line2D(
                [0], [0],
                marker="o",
                color="w",
                markerfacecolor=cat_to_color[cat],
                markersize=6,
                label=cat,
            )
            for cat in categories
        ]
        plt.tight_layout()
        fig.legend(
            handles=handles,
            title=legend_title,
            loc="center left",
            bbox_to_anchor=(1.02, 0.5),
            fontsize=9,
            title_fontsize=11,
            frameon=True,
            markerscale=1.5,
        )

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
        "plotType": "umap_coloring",
        "color_by": color_by,
        "image": b64,
        "format": "png",
        "width": width,
        "height": height,
    }
