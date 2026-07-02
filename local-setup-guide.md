# MRS-DB — Local Setup & Run Guide

This guide covers setting up and running the MRS-DB application locally, including the React frontend, FastAPI backend, and the interactive Dotplot/UMAP plotting feature.

---

## 1. Prerequisites

| Tool | Minimum Version | How to Check |
|------|----------------|--------------|
| **Python** | 3.10+ | `python --version` |
| **Node.js** | 18+ | `node --version` |
| **npm** | 9+ | `npm --version` |
| **pip** | (bundled with Python) | `pip --version` |

### 1.1 Node.js via nvm (recommended)

If Node.js isn't installed or you use nvm:

```bash
# Install nvm (if not already)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Load nvm (add this to ~/.bashrc for persistence)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# Install Node 20
nvm install 20
nvm use 20
```

### 1.2 Data Files

The backend loads `.h5ad` files from the `data/` directory. At minimum you need:

```
data/
  Ath_3h_slim.h5ad    # 3-hour timepoint (~4.5 GB)
  Ath_1h_slim.h5ad    # 1-hour timepoint (optional)
  Ath_6h_slim.h5ad    # 6-hour timepoint (optional)
```

> **Memory note:** The 3h file is ~4.5 GB. Ensure ≥16 GB RAM is available.

---

## 2. Project Structure

```
MRS-DB/
├── api/                     # FastAPI backend (NEW)
│   ├── __init__.py
│   ├── main.py              # App entry point, routes, CORS
│   ├── models.py            # Pydantic request/response schemas
│   ├── plot_service.py      # Dotplot + UMAP generation
│   └── requirements.txt     # Python dependencies
├── src/                     # React frontend
│   ├── App.js               # Main app (tab bar, API calls)
│   ├── App.css              # Styles (plot tabs included)
│   └── components/
│       ├── GeneExpressionTable.js
│       └── PlotDisplay.js   # Renders PNG / Plotly JSON (NEW)
├── data/                    # h5ad files
├── public/                  # Static assets
├── build/                   # Production build output
└── package.json
```

---

## 3. Backend Setup (FastAPI)

### 3.1 Install Python Dependencies

```bash
cd /path/to/MRS-DB

# Option A: Install globally (if using conda base env)
pip install -r api/requirements.txt

# Option B: Create a virtual environment
python -m venv .venv
source .venv/bin/activate   # Linux/Mac
pip install -r api/requirements.txt
```

> **Important:** FastAPI ≥0.115.0 is required for compatibility with Starlette 1.x. The `requirements.txt` pins this.

### 3.2 Verify Setup

```bash
python -c "
import scanpy as sc
a = sc.read_h5ad('data/Ath_3h_slim.h5ad')
print('obs columns:', list(a.obs.columns))
print('obsm keys:', list(a.obsm.keys()))
print('n_obs:', a.n_obs)
"
```

Expected output includes `group` and `celltype` in `obs.columns`, and `X_umap` in `obsm.keys`.

### 3.3 Start Backend

```bash
uvicorn api.main:app --host 0.0.0.0 --port 8001
```

Or with auto-reload for development:

```bash
uvicorn api.main:app --reload --host 0.0.0.0 --port 8001
```

### 3.4 Verify Backend

```bash
# Health check
curl http://localhost:8001/api/health
# → {"status":"ok","loaded_timepoints":[]}

# Test dotplot
curl -s -X POST http://localhost:8001/api/plot \
  -H 'Content-Type: application/json' \
  -d '{
    "plotType":"dotplot",
    "genes":["FDH","NAC001"],
    "genotypes":["Col0_AA"],
    "cellTypes":["Mesophyll"],
    "timepoint":"3h"
  }' | python -c "import sys,json; r=json.load(sys.stdin); print(r['plotType'], r['format'], len(r['image']))"
# → dotplot png <base64_length>
```

---

## 4. Frontend Setup (React)

### 4.1 Install npm Dependencies

```bash
# Ensure nvm is loaded first
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

cd /path/to/MRS-DB
npm install
```

### 4.2 Start Frontend

```bash
npm start
```

The React dev server starts on **http://localhost:3000**. It auto-proxies `/api/*` calls to the backend at `localhost:8001` (configured via `"proxy"` in `package.json`).

---

## 5. Docker Setup (Single Port)

The multi-stage Docker build packages the React frontend, FastAPI backend, and nginx reverse proxy into a single container, all served on port 80.

### 5.1 Prerequisites

| Tool | Minimum Version | How to Check |
|------|----------------|--------------|
| **Docker** | 20.10+ | `docker --version` |

Plus ≥16 GB RAM available on the host machine (the 3h `.h5ad` file is ~4.5 GB and is loaded into memory).

### 5.2 Build the Image

```bash
cd /path/to/MRS-DB
docker build -t mrs-db:latest .
```

> The build uses a multi-stage Dockerfile: a `node:20-alpine` stage compiles the React frontend, then a `python:3.10-slim` runtime stage bundles it with nginx, supervisord, and the FastAPI backend.

### 5.3 Run the Container

```bash
docker run -d \
  --name mrs-db \
  -p 80:80 \
  -v "$(pwd)/data:/app/data" \
  mrs-db:latest
```

| Flag | Purpose |
|------|---------|
| `-d` | Run in detached mode (background) |
| `--name mrs-db` | Name the container for easy reference |
| `-p 80:80` | Map host port 80 to container port 80 |
| `-v $(pwd)/data:/app/data` | Mount the local `data/` directory into the container so `.h5ad` files are accessible |

### 5.4 Architecture

```
Browser :80 → nginx ─┬─ /              → React static build
                      ├─ /api/*         → proxy_pass → uvicorn :8001 (FastAPI)
                      └─ /data/processed/* → static JSON files
```

- **nginx** listens on port 80, serves the React build, and proxies `/api/*` requests to uvicorn internally on `127.0.0.1:8001`.
- **supervisord** manages both nginx and uvicorn, auto-restarting either if they crash.
- **`API_BASE`** in the React app is set to `''` (relative paths), so all API calls go to the same origin — no CORS issues.

### 5.5 Verify

```bash
# Health check (API is alive)
curl http://localhost/api/health
# → {"status":"ok","loaded_timepoints":[]}

# API docs (Swagger UI)
# Open http://localhost/api/docs in browser

# Frontend
# Open http://localhost in browser

# Static data files
curl -s http://localhost/data/processed/3h.json | head -c 200
```

### 5.6 View Logs

```bash
docker logs -f mrs-db
```

You should see both `[program:nginx]` and `[program:uvicorn]` entering the `RUNNING` state. Uvicorn takes 5–10 seconds to start due to scanpy imports.

### 5.7 Stop & Clean Up

```bash
docker stop mrs-db && docker rm mrs-db
```

### 5.8 Troubleshooting (Docker)

| Problem | Solution |
|---------|----------|
| Container exits immediately | Check logs: `docker logs mrs-db`. Usually a missing config file or Python import error. |
| `uvicorn` not starting | Verify `api/requirements.txt` is up to date. Ensure `supervisord.conf` exists at repo root. |
| nginx returns 502 Bad Gateway | Uvicorn may still be starting (scanpy imports are slow). Wait 10–15s and retry. |
| `data/` files not found | Confirm the volume mount: `docker exec mrs-db ls /app/data/` |
| Out of memory | Ensure ≥16 GB RAM. Monitor: `docker stats mrs-db` |
| Port 80 already in use | Change host port: `-p 8080:80`, then access at `http://localhost:8080` |
| Build fails (npm) | Clear npm cache: `docker builder prune` then rebuild |

---

## 6. One-Command Quickstart (Dev, no Docker)

**Terminal 1 — Backend:**
```bash
cd /path/to/MRS-DB
uvicorn api.main:app --reload --host 0.0.0.0 --port 8001
```

**Terminal 2 — Frontend:**
```bash
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"
cd /path/to/MRS-DB
npm start
```

---

## 7. Using the Application

1. Open the app in your browser:
   - **Docker:** http://localhost
   - **Dev mode:** http://localhost:3000
2. In the left sidebar, make four selections:

   | Filter | Example |
   |--------|---------|
   | **Gene List** | Pick any list from the dropdown |
   | **Genotype** | Select one or more, e.g. `Col0_AA`, `nac17_AA` |
   | **Genes** | Pick 1–10 genes, e.g. `FDH`, `NAC001`, `AOX1A` |
   | **Cell Types** | Select one or more, e.g. `Mesophyll`, `Epidermis` |

3. Once all four are selected, three tabs appear:

   | Tab | What it does |
   |-----|-------------|
   | **Table** | Gene expression data table (default) |
   | **Dotplot** | Faceted dotplot showing mean expression + % expressing per cell type per genotype (PNG) |
   | **UMAP** | Interactive UMAP feature plot colored by gene expression, one subplot per genotype (Plotly) |

4. Switch timepoints using the pill buttons (**1h / 3h / 6h**)
5. Click **Download** to export the current table data as an Excel file

---

## 8. API Reference

### `GET /api/health`

Returns loaded timepoints and server status.

```json
{"status": "ok", "loaded_timepoints": ["3h"]}
```

### `POST /api/plot`

Generates a dotplot (PNG) or UMAP feature plot (Plotly JSON).

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `plotType` | `"dotplot"` \| `"umap"` | ✅ | Plot type |
| `genes` | `list[str]` | ✅ | Gene symbols (1–10) |
| `genotypes` | `list[str]` | ✅ | Genotype/group values |
| `cellTypes` | `list[str]` | ✅ | Cell type values |
| `timepoint` | `"1h"` \| `"3h"` \| `"6h"` | ✅ | Timepoint |
| `gene` | `str` | For UMAP only | Single gene to color by |

**Dotplot response (200):**
```json
{
  "plotType": "dotplot",
  "image": "iVBORw0KGgo...base64...",
  "format": "png",
  "width": 743,
  "height": 584
}
```

**UMAP response (200):**
```json
{
  "plotType": "umap",
  "data": { "data": [...], "layout": {...} },
  "format": "plotly_json"
}
```

**Error (400):**
```json
{"detail": "Gene 'FAKE_GENE' not found in dataset"}
```

---

## 9. Troubleshooting

| Problem | Solution |
|---------|----------|
| `npm: command not found` | Run `export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"` first |
| `react-scripts: Permission denied` | Run `npm install` to reinstall dependencies |
| `ModuleNotFoundError: No module named 'api'` | Run uvicorn from the repo root: `cd /path/to/MRS-DB` |
| `Timepoint '1h' data file not found` | Place `Ath_1h_slim.h5ad` in `data/` or only use available timepoints |
| `No observations remain after filtering` | Check that your selected genotypes/cell types exist in the data |
| Backend won't start (Starlette/FastAPI conflict) | Ensure `fastapi>=0.115.0` is installed: `pip install "fastapi>=0.115.0"` |
| Out of memory | The 3h h5ad needs ~6 GB RAM. Close other applications or add swap. |
| CORS errors | Not expected — the React dev proxy forwards `/api/*` same-origin. If the backend port changes, update `"proxy"` in `package.json`. |

---

## 10. Production Build

To create a static production build:

```bash
npm run build
```

This outputs optimized files to `build/`. Serve with nginx (see `nginx.conf`) or any static file server.
