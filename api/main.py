"""FastAPI backend for MRS-DB plot generation."""
from __future__ import annotations

import logging
import threading
from pathlib import Path

import scanpy as sc
from anndata import AnnData
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api.models import DotplotResponse, PlotRequest, PlotType, UmapResponse
from api.plot_service import generate_dotplot, generate_umap

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Constants ────────────────────────────────────────────────────────────────
REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data"

TIMEPOINT_FILE_MAP: dict[str, str] = {
    "1h": "Ath_1h_slim.h5ad",
    "3h": "Ath_3h_slim.h5ad",
    "6h": "Ath_6h_slim.h5ad",
}

# ── Global state (lazy-loaded on first request) ──────────────────────────────
_adata_cache: dict[str, AnnData] = {}
_load_lock = threading.Lock()


def _get_adata(timepoint: str) -> AnnData:
    """Lazy-load an h5ad file into cache on first access."""
    if timepoint in _adata_cache:
        return _adata_cache[timepoint]

    with _load_lock:
        # Double-check inside lock
        if timepoint in _adata_cache:
            return _adata_cache[timepoint]

        filename = TIMEPOINT_FILE_MAP[timepoint]
        filepath = DATA_DIR / filename
        if not filepath.exists():
            raise HTTPException(
                status_code=400,
                detail=f"Timepoint '{timepoint}' data file not found: {filename}",
            )
        logger.info("Loading %s (%s)...", timepoint, filename)
        _adata_cache[timepoint] = sc.read_h5ad(filepath)
        logger.info(
            "Loaded %s: %d obs × %d vars",
            timepoint,
            _adata_cache[timepoint].n_obs,
            _adata_cache[timepoint].n_vars,
        )
    return _adata_cache[timepoint]


# ── App Setup ────────────────────────────────────────────────────────────────
app = FastAPI(
    title="MRS-DB Plot API",
    version="0.1.0",
    docs_url="/api/docs",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # React dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Endpoints ────────────────────────────────────────────────────────────────


@app.post("/api/plot")
async def plot_endpoint(req: PlotRequest):
    """Generate a dotplot or UMAP feature plot.

    Accepts filter state from the React frontend and returns either a
    base64-encoded PNG (dotplot) or Plotly JSON (UMAP).
    """
    tp = req.timepoint.value  # e.g. "3h"
    adata = _get_adata(tp)

    # ── Validate genes exist ──
    if req.plotType == PlotType.UMAP:
        if not req.gene:
            raise HTTPException(
                status_code=400,
                detail="field 'gene' is required when plotType='umap'",
            )
        gene_to_check = [req.gene]
    else:
        gene_to_check = req.genes

    missing = [g for g in gene_to_check if g not in adata.var_names]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Gene(s) not found in dataset: {', '.join(missing)}",
        )

    try:
        if req.plotType == PlotType.DOTPLOT:
            result = generate_dotplot(
                adata=adata,
                genes=req.genes,
                cell_types=req.cellTypes,
                genotypes=req.genotypes,
            )
            return JSONResponse(content=result)

        elif req.plotType == PlotType.UMAP:
            result = generate_umap(
                adata=adata,
                gene=req.gene,
                cell_types=req.cellTypes,
                genotypes=req.genotypes,
            )
            return JSONResponse(content=result)

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Unexpected error generating %s plot", req.plotType.value)
        raise HTTPException(status_code=500, detail=f"Internal server error: {e}")


@app.get("/api/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "ok",
        "loaded_timepoints": sorted(_adata_cache.keys()),
    }
