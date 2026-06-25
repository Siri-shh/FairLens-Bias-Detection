# FairLens — Changelog & Security Documentation

This document comprehensively records every technical change made to the FairLens codebase across the development lifecycle, organized by category and date.

---

## Visible Security Features (April 2026)

### Feature 1 — PII Detection Warning on Upload
**New files:** `backend/services/pii_detector.py`  
**Modified files:** `backend/routers/upload.py`, `frontend/app/upload/page.tsx`

When a CSV is uploaded, FairLens now automatically scans every column name and up to 5 sample values for Personally Identifiable Information patterns before analysis begins.

**Detection strategy:**
- **Keyword match** on column name — `email`, `phone`, `ssn`, `dob`, `name`, `address`, `ip`, `credit_card`, `passport`, `nhs`, etc.
- **Regex pattern match** on sample values — email format, SSN format (xxx-xx-xxxx), credit card format, IP address, date of birth

**Risk levels:** `critical` (SSN, credit card, passport), `high` (email, phone, DOB), `medium` (name, address, IP)

**API change:** `POST /upload/csv` now returns an additional `pii_scan` field:
```json
{
  "job_id": "...",
  "columns": [...],
  "row_count": 50000,
  "pii_scan": {
    "has_pii": true,
    "flagged_columns": [
      {"column": "email", "reason": "Email address", "risk": "high"},
      {"column": "ssn",   "reason": "Government ID number", "risk": "critical"}
    ]
  }
}
```

**Frontend:** A dismissible amber warning banner appears after upload if `has_pii: true`. Each flagged column is shown as a color-coded pill (rose = critical, amber = high, yellow = medium) with the reason. The banner includes a privacy statement: *"Your data is processed locally and never stored beyond 24 hours."*

PII detection is **best-effort** — a detection failure never blocks the upload.

---

### Feature 2 — CONFIDENTIAL Watermark on PDF Reports
**Modified files:** `backend/services/pdf_generator.py`

Every page of every generated PDF audit report now displays a diagonal `CONFIDENTIAL` watermark in light gray (18% opacity). The watermark is implemented as a ReportLab canvas callback passed to both `onFirstPage` and `onLaterPages` of `SimpleDocTemplate.build()`.

**Technical implementation:**
```python
def _draw_watermark(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica-Bold", 52)
    canvas.setFillColor(Color(0.75, 0.75, 0.75, alpha=0.18))
    canvas.translate(306, 396)   # centre of US Letter page
    canvas.rotate(45)
    canvas.drawCentredString(0, 0, "CONFIDENTIAL")
    canvas.restoreState()
```

The low opacity ensures the watermark is clearly visible on a white background but does not obscure the report content. Applies to all pages including multi-page reports.

---

### Feature 3 — Secure Audit Log (Chain of Custody)
**New files:** `backend/services/audit_logger.py`  
**Modified files:** `backend/routers/upload.py`, `backend/routers/explain.py`, `backend/routers/report.py`, `frontend/app/results/[job_id]/page.tsx`

Every significant action on an audit job is now recorded to a per-job `audit.log` file (JSON-lines format).

**Events tracked:**
| Event | Trigger |
|---|---|
| `upload_csv` | CSV file accepted by `/upload/csv` |
| `explanation_generated` | Gemini analysis completed |
| `question_asked` | User submits a follow-up question (first 120 chars logged) |
| `report_generated` | PDF generated for the first time |
| `report_downloaded` | PDF byte-stream endpoint called |

**Log format** (`storage_local/results/{job_id}/audit.log`):
```json
{"ts": "2026-04-24T13:55:00Z", "event": "upload_csv", "job_id": "abc123", "ip": "unknown", "detail": {"filename": "data.csv", "row_count": 50000, "columns": 12, "pii_detected": true}}
{"ts": "2026-04-24T13:58:12Z", "event": "report_downloaded", "job_id": "abc123", "ip": "unknown", "detail": {}}
```

**New API endpoint:** `GET /api/v1/audit-log/{job_id}` (requires `X-API-Key`)
```json
{"job_id": "abc123", "events": [{"ts": "...", "event": "report_downloaded", ...}, ...]}
```

**Frontend:** A "Secure Audit Log" panel appears at the bottom of every Results dashboard. It shows a color-coded table of all events with timestamps. The panel includes a "Chain of Custody" badge, suitable for compliance officers to screenshot for audit submissions.

---

## Phase 1 — Security Hardening (April 2026)

### 1.1 API Key Authentication
**Files changed:** `backend/services/auth.py` *(new)*, all routers

A new `services/auth.py` module was created to provide a FastAPI dependency that enforces `X-API-Key` header authentication on every protected endpoint. The check uses `hmac.compare_digest()` — a constant-time comparison that prevents timing-based attacks where an attacker could guess the key one character at a time by measuring response latency.

**All 10 routes across 6 routers are now protected:**

| Router | Routes Secured |
|---|---|
| `upload.py` | `POST /upload/csv`, `POST /upload/model` |
| `analyze.py` | `POST /analyze/configure` |
| `remediate.py` | `GET /results/{job_id}`, `POST /remediate/reweigh`, `GET /remediate/threshold` |
| `explain.py` | `POST /explain`, `POST /ask`, `POST /explain/individual` |
| `report.py` | `GET /report/{job_id}`, `GET /report/{job_id}/pdf` |
| `history.py` | `GET /history` |

**Public endpoints (no key required):** `/`, `/health`, `/docs`, `/openapi.json` — Cloud Run health checks and browser navigation remain unaffected.

**Environment variables added:**
```
# backend/.env
SECRET_API_KEY=<generate with: python -c "import secrets; print(secrets.token_hex(32))">

# frontend/.env.local
NEXT_PUBLIC_API_KEY=<same value as SECRET_API_KEY>
```

**How the client sends the key:**
```
X-API-Key: your-secret-key-here
```

---

### 1.2 Rate Limiting
**Files changed:** `backend/main.py`, `backend/requirements.txt`

`slowapi>=0.1.9` was added as a dependency and wired into the FastAPI application as middleware. The limiter uses the client's IP address as the rate-limiting key.

**Limits applied:**
- Default global limit: **200 requests/minute per IP**
- If exceeded, the API returns `HTTP 429 Too Many Requests` with a `Retry-After` header

The limiter is attached to `app.state.limiter` so individual routes can override the default with decorators in future if needed (e.g., stricter limits on `/upload/csv`).

---

### 1.3 File Upload Hardening
**Files confirmed wired:** `backend/services/csv_validator.py`, `backend/routers/analyze.py`

The `csv_validator.py` module (authored by Aditya) enforces the following guards before any analysis pipeline begins:

| Guard | Limit | HTTP Error |
|---|---|---|
| Minimum rows | 50 rows | 400 |
| Maximum rows | 2,000,000 rows | 400 |
| Maximum columns | 500 columns | 400 |
| Missing data | < 40% overall | 400 |
| Target cardinality | ≤ 20 unique values | 400 |
| Protected attr cardinality | ≤ 50 unique values per attr | 400 |

Additionally, `upload.py` enforces:
- File extension must be `.csv`
- File size must be < 200 MB (enforced before parsing)
- Model files limited to `.pkl` or `.onnx` formats only, < 500 MB

---

### 1.4 CORS Hardening
**Files changed:** `backend/main.py`

Previously, CORS was configured with `allow_methods=["*"]` and a regex that permitted any port on localhost unconditionally. This was replaced with an environment-driven whitelist.

**Before:**
```python
allow_origins=["http://localhost:3000", "https://fairlens.vercel.app"]
allow_origin_regex=r"http://localhost:\d+"  # Always active
allow_methods=["*"]
```

**After:**
```python
allow_origins=[FRONTEND_URL, "http://localhost:3000", ...]  # Driven by env var
allow_origin_regex=r"http://localhost:\d+"  # Only active if FRONTEND_URL is not https://
allow_methods=["GET", "POST", "OPTIONS"]    # Explicit — no DELETE/PUT exposed
```

**In production:** Set `FRONTEND_URL=https://your-vercel-domain.vercel.app` in Cloud Run config. The regex wildcard is automatically disabled when a production HTTPS URL is detected.

---

### 1.5 Frontend API Key Header Wiring
**Files changed:** `frontend/lib/api.ts`

A `getHeaders()` helper function was added that reads `NEXT_PUBLIC_API_KEY` from the environment and returns a headers object with `X-API-Key` attached. This function is called in every `fetch()` call across the file, ensuring the authentication header is sent consistently.

```typescript
function getHeaders(extra?: Record<string, string>): Record<string, string> {
  const key = process.env.NEXT_PUBLIC_API_KEY || ""
  return {
    ...(key ? { "X-API-Key": key } : {}),
    ...extra,
  }
}
```

**Calls updated:** uploadCSV, uploadModel, configureJob, pollStatus, getResults, streamExplanation (fetch), askQuestion, getThreshold, downloadReport (9 total)

---

## Previous Session Changes (April 2026)

### Aditya Branch Integration
**Merged from:** `origin/aditya`  
**Deployed revision:** Cloud Run `00021`

| Category | What Was Added |
|---|---|
| **Frontend** | New `History` page, `Compare` page, Chatbox component, theme overhaul |
| **PDF Engine** | Complete rewrite using `reportlab` — multi-page reports with charts, compliance tables, AI analysis section |
| **Backend Analytics** | `fairness_score.py` (0–100 score), `compliance_mapper.py` (GDPR/EU AI Act mapping), `csv_validator.py` |
| **Bug Fix** | `frontend/lib/api.ts` — exported `API_BASE` (was missing, broke Compare page) |
| **Bug Fix** | `frontend/app/history/page.tsx` — fixed TypeScript strict type error on Recharts Tooltip formatter |
| **Bug Fix** | `backend/tests/test_bias_engine.py` — removed invalid `positive_label` kwarg that caused 3 test failures |

**Critical fix applied during merge:** Aditya's branch accidentally deleted `backend/requirements.txt`. This was restored via `git checkout origin/main -- backend/requirements.txt` to prevent Docker build failures.

---

### Gemini AI Service Overhaul
**Files changed:** `backend/services/gemini.py`

| Change | Detail |
|---|---|
| **Model list** | Updated `_PREFERRED` from deprecated `gemini-1.5-*` models to `gemini-2.5-flash`, `gemini-flash-latest`, `gemma-3-27b-it`, `gemma-3-12b-it`, `gemini-2.0-flash` |
| **503 handling** | Added `_is_unavailable()` helper — server overload errors now silently failover to the next model instead of crashing |
| **Q&A retry** | `answer_question()` now retries up to 3 times with exponential backoff on rate limits |
| **Fallback explanation** | `generate_explanation()` now catches all API failures and returns a structured fallback dict instead of raising an exception to the user |

---

### PDF Generation Fix
**Files changed:** `backend/services/pdf_generator.py`

Fixed corrupted UTF-8 mojibake characters (e.g., `â€"` instead of `—`) that appeared in generated PDFs. The corruption was caused by a mixed-encoding git merge. All affected string literals were replaced with ASCII-safe equivalents.

---

### SHAP Engine Fix
**Files changed:** `backend/ml/shap_engine.py`

Fixed an `IndexError` where `KernelExplainer` results were incorrectly indexed as a 3D array during binary classification. Added an explicit list-type check to correctly handle the binary output shape.

---

### Performance Optimizations

| Optimization | Before | After |
|---|---|---|
| Threshold Simulator (frontend) | 9 sequential API calls (~9s total) | `Promise.all()` parallel calls (~1.5s total) |
| Model inference fallback (backend) | `pandas.iterrows()` loop | NumPy vectorized operations (~50x faster on large datasets) |

---

## Environment Variable Reference

### Backend (`backend/.env`)
| Variable | Required | Description |
|---|---|---|
| `USE_LOCAL_STORAGE` | Yes | `true` = use local disk (default) |
| `LOCAL_UPLOAD_DIR` | No | Path for uploaded files. Default: `./storage_local/uploads` |
| `LOCAL_RESULTS_DIR` | No | Path for analysis results. Default: `./storage_local/results` |
| `USE_MOCK_PIPELINE` | No | `true` = skip real analysis, use mock data |
| `FRONTEND_URL` | Yes | CORS allowlist — your frontend domain |
| `GEMINI_API_KEY` | Yes | Free key from https://aistudio.google.com/apikey |
| `SECRET_API_KEY` | Yes | Shared secret for `X-API-Key` header auth |

### Frontend (`frontend/.env.local`)
| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | Backend API base URL |
| `NEXT_PUBLIC_USE_MOCK` | `true` = bypass API entirely, use mock data |
| `NEXT_PUBLIC_API_KEY` | Must match `SECRET_API_KEY` in backend |

---

## Deployment Reference

### Production Stack
- **Backend:** Render (Docker web service, free tier)
- **Frontend:** Vercel (Next.js, free tier)

See the main [README.md](../README.md) for step-by-step deployment instructions.

