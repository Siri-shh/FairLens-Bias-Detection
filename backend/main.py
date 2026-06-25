"""
FairLens — FastAPI main application

Architecture:
  - Upload, analyze, storage, status, inference
  - Bias engine, SHAP, remediation, threshold calibration
  - Gemini AI explanation, PDF report generation
  - Next.js frontend (separate deployment)
"""

import sys
import os
import logging
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

# Load .env before anything else
load_dotenv()

# Add ml/ to sys.path so bias engine modules can import each other
sys.path.insert(0, str(Path(__file__).parent / "ml"))

# ── Unpickling compatibility fix ─────────────────────────────────────────────
# Scikit-learn models pickled in older versions may refer to the Cython C-extension
# module as a top-level '_loss' module. We map it to the actual path in sys.modules
# to prevent ModuleNotFoundError during joblib.load/pickle.load.
try:
    import sklearn.ensemble  # Force scikit-learn internal module registration
    import sklearn._loss._loss as sklearn_loss
    sys.modules['_loss'] = sklearn_loss
except Exception:
    pass


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("fairlens")

# Rate limiter (uses client IP by default)
limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])

# --- Router imports ---
from routers import upload          # file uploads
from routers import analyze         # job configuration + pipeline
from routers import remediate       # bias remediation + results
from routers import explain         # Gemini AI explanation
from routers import report          # PDF report generation
from routers import worker          # Phase 2.1: Cloud Tasks internal worker


# --- Lifespan: startup / shutdown ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("FairLens API starting up...")

    use_local = os.getenv("USE_LOCAL_STORAGE", "true").lower() == "true"
    if use_local:
        logger.info("  ✅ Storage mode: LOCAL DISK (no GCP needed)")
        logger.info(f"  Upload dir : {os.getenv('LOCAL_UPLOAD_DIR', './storage_local/uploads')}")
        logger.info(f"  Results dir: {os.getenv('LOCAL_RESULTS_DIR', './storage_local/results')}")
        logger.info(f"  Mock pipeline: {os.getenv('USE_MOCK_PIPELINE', 'false')}")

        # Ensure local storage dirs exist
        uploads_dir = Path(os.getenv("LOCAL_UPLOAD_DIR", "./storage_local/uploads"))
        results_dir = Path(os.getenv("LOCAL_RESULTS_DIR", "./storage_local/results"))
        uploads_dir.mkdir(parents=True, exist_ok=True)
        results_dir.mkdir(parents=True, exist_ok=True)
    else:
        project = os.getenv("GCP_PROJECT_ID")
        if not project:
            raise RuntimeError("GCP_PROJECT_ID not set. Check your .env file.")
        logger.info(f"  Storage mode: GCP")
        logger.info(f"  GCP project: {project}")
        logger.info(f"  Upload bucket: {os.getenv('GCS_UPLOAD_BUCKET')}")
        logger.info(f"  Results bucket: {os.getenv('GCS_RESULTS_BUCKET')}")
        logger.info(f"  Gemini model: {os.getenv('GEMINI_MODEL')}")

    logger.info("  ✅ Ready — visit http://localhost:8000/docs")

    # Phase 2 — log scalability service status
    queue_configured = bool(os.getenv("CLOUD_TASKS_QUEUE"))
    db_configured    = bool(os.getenv("GCP_PROJECT_ID"))
    redis_configured = bool(os.getenv("REDIS_URL"))
    logger.info(f"  Job queue  : {'Cloud Tasks' if queue_configured else 'In-process BackgroundTasks (fallback)'}")
    logger.info(f"  Database   : {'Firestore' if db_configured else 'Local JSON files (fallback)'}")
    logger.info(f"  Cache      : {'Redis (Cloud Memorystore)' if redis_configured else 'In-memory TTL cache (fallback)'}")

    yield
    logger.info("FairLens API shutting down.")


# --- App init ---
app = FastAPI(
    title="FairLens API",
    description="Bias detection and remediation platform for ML models",
    version="1.0.0",
    lifespan=lifespan,
)

# --- Rate limiter state ---
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)


# --- CORS: Allow all origins to bypass trailing slash and formatting issues ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Mount static files for local storage downloads ---
# This lets get_signed_url() return "/storage_local/results/{job_id}/report.pdf"
# and the frontend can download it directly.
storage_local_dir = Path(os.getenv("LOCAL_RESULTS_DIR", "./storage_local/results"))
storage_local_dir.mkdir(parents=True, exist_ok=True)
app.mount(
    "/storage_local/results",
    StaticFiles(directory=str(storage_local_dir)),
    name="local_results",
)

uploads_dir = Path(os.getenv("LOCAL_UPLOAD_DIR", "./storage_local/uploads"))
uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount(
    "/storage_local/uploads",
    StaticFiles(directory=str(uploads_dir)),
    name="local_uploads",
)


# --- Mount all routers ---
app.include_router(upload.router,    prefix="/api/v1", tags=["ingestion"])
from routers import scenario
app.include_router(scenario.router,  prefix="/api/v1", tags=["ingestion"])
app.include_router(analyze.router,   prefix="/api/v1", tags=["analysis"])
app.include_router(remediate.router, prefix="/api/v1", tags=["remediation"])
app.include_router(explain.router,   prefix="/api/v1", tags=["ai"])
app.include_router(report.router,    prefix="/api/v1", tags=["report"])
from routers import history
app.include_router(history.router,   prefix="/api/v1", tags=["history"])
app.include_router(worker.router,    prefix="",        tags=["internal"])  # Phase 2.1


# --- Health check (used by Cloud Run to verify the container is alive) ---
@app.get("/health", tags=["infra"])
@app.head("/health", include_in_schema=False)
async def health():
    use_local = os.getenv("USE_LOCAL_STORAGE", "true").lower() == "true"
    return {
        "status": "ok",
        "service": "fairlens-api",
        "version": "1.0.0",
        "storage": "local" if use_local else "gcp",
        "mock_pipeline": os.getenv("USE_MOCK_PIPELINE", "false"),
    }


# --- Root ---
@app.get("/", tags=["infra"])
async def root():
    return {
        "service": "FairLens API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )