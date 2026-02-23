import os
import uuid
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

# Your pipeline runner lives here
from pipeline import run_pipeline_to_xlsx

app = FastAPI(title="OpenAlex Local Backend")

# Chrome extensions call from an origin like: chrome-extension://<extension-id>
# Local-only dev: allowing "*" is fine. You can tighten later.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory job store (local-only)
JOBS: Dict[str, Dict[str, Any]] = {}


class RunRequest(BaseModel):
    # Seeds
    seed_work_ids: List[str]

    # Tunables (mirror your script defaults; extension can override)
    max_citing_works_per_seed: int = 300
    year_start: int = 2019
    year_end: int = 2026
    max_works_per_author: int = 400
    sleep_seconds: float = 0.10

    include_seed_authors: bool = True
    seed_author_bonus: int = 3

    eng_gate_enabled: bool = True
    eng_gate_min_score: int = 8
    eng_gate_max_works_scanned: int = 30

    # Optional GitHub sniff toggle + token
    github_sniff_enabled: bool = False
    github_token: Optional[str] = None


@app.get("/")
def root():
    return {"ok": True}


@app.post("/run")
def run(req: RunRequest):
    """
    Kicks off the pipeline and returns a job_id.
    NOTE: download_url is a RELATIVE path; your UI should prepend API_BASE.
    """
    seeds = [s.strip().upper() for s in req.seed_work_ids if s.strip()]
    if not seeds:
        raise HTTPException(status_code=400, detail="No seed_work_ids provided.")

    # If GitHub sniff is enabled and a token is provided, set it for this run.
    # (Local-only server; simplest approach.)
    if req.github_sniff_enabled and req.github_token:
        os.environ["GITHUB_TOKEN"] = req.github_token.strip()
    elif not req.github_sniff_enabled:
        # Ensure we don't accidentally reuse a prior token from environment
        # (this matters if you're sharing with teammates)
        os.environ.pop("GITHUB_TOKEN", None)

    job_id = str(uuid.uuid4())
    JOBS[job_id] = {
        "status": "running",
        "error": None,
        "out_path": None,
        "progress": {
            "stage": "starting",
            "processed": 0,
            "total": 1,
            "stage_pct": 0.0,
            "overall_pct": 0.0,
            "message": "Starting…",
        },
    }

    def progress_cb(update: Dict[str, Any]) -> None:
        JOBS[job_id]["progress"] = update

    try:
        out_path = run_pipeline_to_xlsx(
            seed_work_ids=seeds,
            max_citing_works_per_seed=req.max_citing_works_per_seed,
            author_work_year_range=(req.year_start, req.year_end),
            max_works_per_author=req.max_works_per_author,
            sleep_seconds=req.sleep_seconds,
            include_seed_authors=req.include_seed_authors,
            seed_author_bonus=req.seed_author_bonus,
            eng_gate_enabled=req.eng_gate_enabled,
            eng_gate_min_score=req.eng_gate_min_score,
            eng_gate_max_works_scanned=req.eng_gate_max_works_scanned,
            github_sniff_enabled=req.github_sniff_enabled,
            progress_cb=progress_cb,
        )

        # Make sure we store an absolute path so downloads work regardless of cwd
        out_path = os.path.abspath(out_path)

        JOBS[job_id]["status"] = "done"
        JOBS[job_id]["out_path"] = out_path
        JOBS[job_id]["progress"] = {
            "stage": "done",
            "processed": 1,
            "total": 1,
            "stage_pct": 100.0,
            "overall_pct": 100.0,
            "message": "Done.",
        }

        print("JOB DONE:", job_id)
        print("OUT_PATH:", out_path, "EXISTS:", os.path.exists(out_path))

    except Exception as e:
        JOBS[job_id]["status"] = "error"
        JOBS[job_id]["error"] = str(e)
        JOBS[job_id]["progress"] = {
            "stage": "error",
            "processed": 0,
            "total": 1,
            "stage_pct": 0.0,
            "overall_pct": 0.0,
            "message": str(e),
        }

    return {
        "job_id": job_id,
        "status": JOBS[job_id]["status"],
        # IMPORTANT: this MUST include the job_id; /download alone will 404
        "download_url": f"/download/{job_id}",
        "status_url": f"/status/{job_id}",
    }


@app.get("/status/{job_id}")
def status(job_id: str):
    j = JOBS.get(job_id)
    if not j:
        raise HTTPException(status_code=404, detail="Unknown job_id")

    return {
        "job_id": job_id,
        "status": j["status"],
        "error": j["error"],
        "progress": j.get("progress"),
        "download_url": f"/download/{job_id}" if j["status"] == "done" else None,
    }


@app.get("/download/{job_id}")
def download(job_id: str):
    """
    Download the XLSX for a completed job.
    """
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job["status"] != "done":
        raise HTTPException(status_code=400, detail=f"Job not complete (status={job['status']})")

    out_path = job.get("out_path")
    if not out_path:
        raise HTTPException(status_code=404, detail="No output path recorded for this job")

    out_path = os.path.abspath(out_path)
    if not os.path.exists(out_path):
        raise HTTPException(status_code=404, detail=f"Output file not found on disk: {out_path}")

    return FileResponse(
        out_path,
        filename=os.path.basename(out_path),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@app.get("/download")
def download_help():
    """
    Friendly helper so hitting /download in a browser doesn't show {"detail":"Not Found"}.
    This fixes the specific UX issue you hit (missing job_id).
    """
    raise HTTPException(
        status_code=400,
        detail="Missing job_id. Use /download/<job_id>. Get a job_id from POST /run or GET /status/<job_id>.",
    )
