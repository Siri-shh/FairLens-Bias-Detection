"""
routers/history.py
Phase 2.2 upgrade: queries Firestore first (when GCP_PROJECT_ID is set),
falls back to local JSON file scanning.
"""

from fastapi import APIRouter, Depends
from services import storage
from services.auth import require_api_key
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


from typing import Optional

@router.get("/history", dependencies=[Depends(require_api_key)])
async def get_history(job_ids: Optional[str] = None):
    """Returns completed jobs matching the provided job_ids list, newest first."""

    # Parse target IDs from query parameter
    target_ids = set()
    if job_ids:
        target_ids = {jid.strip() for jid in job_ids.split(",") if jid.strip()}
    else:
        # Return empty list by default to ensure privacy of other users' audits
        return []

    # ── Firestore path (Phase 2.2) ────────────────────────────────────────────
    try:
        from services.db import db_list_jobs
        db_jobs = db_list_jobs(limit=50)
        if db_jobs:
            # Filter to target IDs
            db_jobs = [job for job in db_jobs if job.get("job_id") in target_ids]
            
            # Enrich with results data if available in local storage
            summaries = []
            for job in db_jobs:
                job_id = job["job_id"]
                try:
                    if storage.file_exists(job_id, "results.json", bucket="results"):
                        r = storage.read_json(job_id, "results.json", bucket="results")
                        summaries.append({
                            "job_id":           job_id,
                            "completed_at":     r.get("completed_at", job.get("created_at", "")),
                            "dataset_info":     r.get("dataset_info", {}),
                            "overall_severity": r.get("overall_severity", "unknown"),
                            "fairness_score":   r.get("fairness_score", {}).get("score", 0),
                            "metrics_passed":   r.get("metrics_passed", 0),
                            "metrics_failed":   r.get("metrics_failed", 0),
                        })
                    elif job.get("stage") == "complete":
                        summaries.append({
                            "job_id":           job_id,
                            "completed_at":     job.get("created_at", ""),
                            "dataset_info":     job.get("config", {}),
                            "overall_severity": "unknown",
                            "fairness_score":   0,
                            "metrics_passed":   0,
                            "metrics_failed":   0,
                        })
                except Exception as e:
                    logger.warning(f"Error enriching Firestore job {job_id}: {e}")
            if summaries:
                return sorted(summaries, key=lambda x: x["completed_at"], reverse=True)
    except Exception as e:
        logger.warning(f"Firestore history query failed, falling back to disk: {e}")

    # ── Local JSON fallback (original behaviour, direct lookup) ───────────────
    summaries = []

    for job_id in target_ids:
        try:
            if not storage.file_exists(job_id, "results.json", bucket="results"):
                continue
            r = storage.read_json(job_id, "results.json", bucket="results")
            summaries.append({
                "job_id":           job_id,
                "completed_at":     r.get("completed_at", ""),
                "dataset_info":     r.get("dataset_info", {}),
                "overall_severity": r.get("overall_severity", "unknown"),
                "fairness_score":   r.get("fairness_score", {}).get("score", 0),
                "metrics_passed":   r.get("metrics_passed", 0),
                "metrics_failed":   r.get("metrics_failed", 0),
            })
        except Exception as e:
            logger.warning(f"Skipping history item for {job_id} due to error: {e}")
            continue

    return sorted(summaries, key=lambda x: x["completed_at"], reverse=True)
