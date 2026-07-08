"""FastAPI backend for MRS-DB plot generation."""
from __future__ import annotations

import asyncio
import hashlib
import json as _json
import logging
import threading
from contextlib import asynccontextmanager
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
    "1h": "Ath_1h.h5ad",
    "3h": "Ath_3h.h5ad",
    "6h": "Ath_6h.h5ad",
}

# ── Global state (lazy-loaded on first request) ──────────────────────────────
_adata_cache: dict[str, AnnData] = {}
_load_lock = threading.Lock()

# ── Plot result cache ────────────────────────────────────────────────────────
# Keyed by SHA-256 of (plotType, timepoint, genes, geneLabels).
# Since h5ad data never changes, identical inputs always produce identical output.
_plot_result_cache: dict[str, dict] = {}
_PLOT_CACHE_MAX = 64  # evict oldest entry (FIFO) when limit is reached


def _make_cache_key(req: PlotRequest) -> str:
    """Return a stable SHA-256 hex key for a plot request."""
    if req.plotType == PlotType.DOTPLOT:
        raw = (
            "dotplot",
            req.timepoint.value,
            tuple(sorted(req.genes)),
            tuple(sorted(req.geneLabels.items())) if req.geneLabels else (),
        )
    else:  # UMAP
        label_val = (
            req.geneLabels.get(req.gene)
            if req.geneLabels and req.gene
            else None
        )
        raw = ("umap", req.timepoint.value, req.gene, label_val)
    return hashlib.sha256(repr(raw).encode()).hexdigest()


# ── Startup: pre-warm AnnData cache ─────────────────────────────────────────

async def _prewarm_adata_cache() -> None:
    """Load each timepoint h5ad sequentially in the background.

    Sequential (not parallel) loading avoids I/O contention on the 4–5 GB files.
    Runs as a background asyncio task so startup is not blocked.
    """
    loop = asyncio.get_event_loop()
    for tp in TIMEPOINT_FILE_MAP:
        try:
            await loop.run_in_executor(None, _get_adata, tp)
            logger.info("Pre-warm complete: %s", tp)
        except Exception as exc:
            logger.warning("Pre-warm failed for %s: %s", tp, exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    asyncio.create_task(_prewarm_adata_cache())
    yield


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
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",   # React dev server (npm start)
        "http://localhost:80",     # Docker nginx (explicit port)
        "http://localhost",        # Docker nginx (default port 80)
        "http://127.0.0.1:3000",   # Alternative localhost
        "http://127.0.0.1:80",
        "http://127.0.0.1",
    ],
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

    Results are cached in-process by a SHA-256 key derived from the request
    parameters.  Since the underlying h5ad data never changes at runtime,
    identical requests are served from cache without regeneration.
    """
    # ── Cache check ──────────────────────────────────────────────────────────
    cache_key = _make_cache_key(req)
    if cache_key in _plot_result_cache:
        logger.info(
            "Cache hit: %s / %s", req.plotType.value, req.timepoint.value
        )
        return JSONResponse(content=_plot_result_cache[cache_key])

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
                gene_labels=req.geneLabels,
            )

        elif req.plotType == PlotType.UMAP:
            gene_label = None
            if req.geneLabels and req.gene:
                gene_label = req.geneLabels.get(req.gene)
            result = generate_umap(
                adata=adata,
                gene=req.gene,
                gene_label=gene_label,
            )

        else:
            raise HTTPException(status_code=400, detail="Unknown plotType")

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Unexpected error generating %s plot", req.plotType.value)
        raise HTTPException(status_code=500, detail=f"Internal server error: {e}")

    # ── Cache populate (FIFO eviction) ───────────────────────────────────────
    if len(_plot_result_cache) >= _PLOT_CACHE_MAX:
        _plot_result_cache.pop(next(iter(_plot_result_cache)))
    _plot_result_cache[cache_key] = result

    return JSONResponse(content=result)


@app.get("/api/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "ok",
        "loaded_timepoints": sorted(_adata_cache.keys()),
    }
