# ── FairLens API — Docker Container ──
# Works on Render, Railway, or any Docker-based host.
# Build:  docker build -t fairlens-api .
# Run:    docker run -p 8000:8000 fairlens-api

FROM python:3.12-slim

# Set working directory
WORKDIR /app

# System deps:
#   gcc       — required for pandas/numpy/shap wheel builds
#   libpango / libcairo / libgdk-pixbuf — required by WeasyPrint (PDF rendering)
#   shared-mime-info / libffi — required by WeasyPrint
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libcairo2 \
    libgdk-pixbuf-xlib-2.0-0 \
    libffi-dev \
    shared-mime-info \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first (Docker cache layer)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Ensure local storage directories exist
RUN mkdir -p ./storage_local/uploads ./storage_local/results

# Local storage mode (no GCS/Firestore/Cloud Tasks needed)
ENV USE_LOCAL_STORAGE=true
ENV USE_MOCK_PIPELINE=false

# PORT is injected by hosting platforms (Render, Railway, etc.)
# Default to 8000 for local development
ENV PORT=8000

# Use shell form so $PORT is expanded at runtime
CMD uvicorn main:app --host 0.0.0.0 --port $PORT

EXPOSE 8000
