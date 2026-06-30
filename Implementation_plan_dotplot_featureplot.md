## Implementation Overview

### Framework Recommendation

**Keep React frontend + Add FastAPI (Python) backend.** This is the minimal-change approach:

- Your existing React filter UI (gene list, genotype, cell type selectors) is already well-built — no need to rewrite it
- FastAPI handles scanpy execution server-side and returns plots as base64 PNG (dotplot, heatmap) or Plotly JSON (UMAP for hover/zoom interactivity)
- React fetches the plot from the API and renders it inline

**Alternative (full Python rewrite):** Migrate to **Dash (Plotly Dash)** — pure Python, scanpy integrates natively, but requires a full frontend rewrite.

---

### Data Profile

```
AnnData object with n_obs × n_vars = 146,597 × 30,620
    obsm: 'X_pca', 'X_umap'       ← UMAP already pre-computed (1.2 MB)
    layers: 'counts'
    File size: ~4.5 GB
```

- UMAP coordinates are already stored in `adata.obsm['X_umap']` — no additional precomputation needed
- The 4.5 GB comes mostly from sparse expression matrix (`X`) and raw counts layer (~4.0 GB combined)
- Adding `obsp` (neighbor graph for dotplot/stacked_violin) would add only ~19 MB
- **Performance baseline (local):** 10-core / 64 GB RAM / NVMe SSD → ~10s for UMAP render. The bottleneck is matplotlib rendering of 146K scatter points and AnnData in-memory expansion (~6 GB), not I/O

---

### Architecture

```
┌─────────────────────────────────┐
│      React Frontend             │
│  - Filter panel (unchanged)     │
│  - Plot type tabs:              │
│    Heatmap | Dotplot | UMAP     │
│  - Renders image/plotly output  │
└───────────┬─────────────────────┘
            │ POST /api/plot  (gene, genotype, celltype, plottype)
┌───────────▼─────────────────────┐
│      FastAPI Backend            │
│  - Loads .h5ad AnnData file     │
│  - sc.pl.heatmap()              │
│  - sc.pl.dotplot()              │
│  - sc.pl.umap(color=gene)       │
│  - Returns base64 PNG or JSON   │
└─────────────────────────────────┘
```

**Key data change:** You'll need the raw `.h5ad` AnnData file(s) on the server — scanpy needs this for dotplot and UMAP embeddings. The current preprocessed JSON files can remain for the heatmap table.

---

### VM Specifications

#### Development VM

| Spec | Value | Rationale |
|------|-------|-----------|
| **vCPUs** | **4** | Single-user dev; scanpy plotting is mostly single-threaded |
| **RAM** | **16 GB** | 6 GB AnnData + 2 GB OS + 4 GB matplotlib + 4 GB headroom |
| **Storage** | **50 GB SSD** | OS (20 GB) + Python env (2 GB) + 1 h5ad file (5 GB) |
| **Price (Azure B4ms)** | $0.17/hr | ~$125/mo full-time |

> If 16 GB causes swap under heavy plotting, bump to 32 GB (B8ms, $0.25/hr).

#### Production VM

| Spec | Value | Rationale |
|------|-------|-----------|
| **vCPUs** | **8** | Handles 2-3 concurrent plot requests without queueing |
| **RAM** | **32 GB** | `gunicorn --preload` shares AnnData across workers via copy-on-write → real usage ~8-10 GB for data; 32 GB total is comfortable |
| **Storage** | **100 GB Premium SSD** | OS + Python env + 1-3 h5ad files + Docker images + logs |
| **Price (Azure D8s v5)** | $0.38/hr | ~$275/mo 24/7 |

#### Production Deployment Strategy

```bash
gunicorn app:app --workers 2 --preload --worker-class uvicorn.workers.UvicornWorker
```

`--preload` loads the 4.5 GB AnnData **before** forking workers. The OS shares the memory pages via copy-on-write, so memory usage stays at ~8-10 GB for the data, not 2×6 GB = 12 GB. This makes 32 GB comfortable for production.

#### Performance Estimates

| Plot Type | Dev (4 vCPU / 16 GB) | Production (8 vCPU / 32 GB) | Your Laptop (10c/64GB/NVMe) |
|-----------|----------------------|---------------------------|------------------------------|
| UMAP | ~3-5s | ~2-4s | ~10s |
| Dotplot | ~2-3s | ~1-2s | — |
| Heatmap (20 genes) | ~5-8s | ~3-5s | — |

> Azure SSD is premium tier — faster than your NVMe for sustained reads. Fewer cores but dedicated, no background processes. Production VM will outperform your laptop despite fewer cores.

---

### Effort Estimate

| | **PM** | **Dev** | **UX** | **Test** | **TOTALS** |
|---|---|---|---|---|---|
| **Design & Plan** | **1** | **5** | **2** | **0** | **8** |
| Architecture & API design | 0.5 | 2 | 0 | 0 | |
| Data pipeline assessment (h5ad handling) | 0 | 2 | 0 | 0 | |
| UX wireframes (dotplot/UMAP views) | 0.5 | 1 | 2 | 0 | |
| **Graphical User Interface** | **1** | **22** | **4** | **8** | **35** |
| FastAPI setup + scanpy integration | 0 | 5 | 0 | 0 | |
| Dotplot endpoint (sc.pl.dotplot) | 0 | 4 | 0 | 0 | |
| UMAP featureplot endpoint (sc.pl.umap) | 0 | 5 | 0 | 0 | |
| React: plot-type tab selector & UI | 0 | 3 | 2 | 0 | |
| React: plot display + loading states | 0 | 3 | 1 | 0 | |
| Integration testing | 0 | 2 | 0 | 6 | |
| UX re-design passes | 1 | 0 | 1 | 2 | |
| **User Acceptance Testing** | **1** | **3** | **1** | **3** | **8** |
| UAT sessions & feedback collection | 1 | 0 | 1 | 2 | |
| Feedback incorporation | 0 | 3 | 0 | 1 | |
| **TOTALS** | **3** | **30** | **7** | **11** | **51** |

---

### Key Implementation Steps

1. **Backend:** Set up FastAPI with scanpy; load `.h5ad` on startup via `--preload`; add `/api/plot` endpoint accepting `{ plotType, genes, genotypes, cellTypes, timepoint }` and returning base64 PNG (or Plotly JSON for UMAP)
2. **Frontend:** Add plot-type tab bar (Heatmap | Dotplot | UMAP); on tab switch, POST filter state to backend and render returned image/plot
3. **Heatmap:** Can remain as the existing React table OR switch to scanpy's `sc.pl.heatmap` for consistency with the other plots
4. **UMAP:** Already pre-computed (`adata.obsm['X_umap']` exists) — `sc.pl.umap()` is near-instant. Optionally run `sc.pp.neighbors(adata)` once and save to add `obsp` (~19 MB) for any neighbor-dependent plots
5. **Deployment:** Use `gunicorn --workers 2 --preload` to share the 4.5 GB AnnData across workers via copy-on-write. Target 8 vCPU / 32 GB production VM