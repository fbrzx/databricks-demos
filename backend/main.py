"""FastAPI app: serves the React frontend and proxies questions to a Genie Space.

Run locally:   uvicorn backend.main:app --reload --port 8000
On Databricks:  see app.yaml (command runs uvicorn on port 8000)
"""
from __future__ import annotations

import os
import re
from datetime import datetime

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import config, exporters
from .genie_client import ask

app = FastAPI(title="Genie Report App", version="0.1.0")

# CORS is only needed during local dev when the Vite dev server (5173) calls the
# API on 8000. In production everything is same-origin, so this is harmless.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ----- API models ---------------------------------------------------------- #
class AskRequest(BaseModel):
    question: str = Field(..., min_length=1)
    conversation_id: str | None = None


class ExportRequest(BaseModel):
    columns: list[str]
    rows: list[list]
    format: str = "csv"          # "csv" | "xlsx"
    filename: str | None = None


# ----- API routes ---------------------------------------------------------- #
@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/config")
def get_config():
    """Lets the frontend show a helpful message if no space is wired up yet."""
    return {"space_configured": bool(config.GENIE_SPACE_ID)}


@app.post("/api/ask")
def post_ask(req: AskRequest):
    try:
        result = ask(req.question, conversation_id=req.conversation_id)
    except RuntimeError as exc:               # config problems
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:                   # noqa: BLE001 - SDK / network
        raise HTTPException(status_code=502, detail=f"Genie request failed: {exc}")
    return result.to_dict()


@app.post("/api/export")
def post_export(req: ExportRequest):
    if not req.columns:
        raise HTTPException(status_code=400, detail="No columns to export.")

    base = _safe_filename(req.filename) or f"genie-report-{datetime.now():%Y%m%d-%H%M%S}"

    if req.format == "xlsx":
        content = exporters.to_xlsx(req.columns, req.rows)
        media = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        name = f"{base}.xlsx"
    elif req.format == "csv":
        content = exporters.to_csv(req.columns, req.rows)
        media = "text/csv"
        name = f"{base}.csv"
    else:
        raise HTTPException(status_code=400, detail="format must be 'csv' or 'xlsx'.")

    return Response(
        content=content,
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


def _safe_filename(name: str | None) -> str | None:
    if not name:
        return None
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", name).strip("-")
    return cleaned or None


# ----- Static frontend ----------------------------------------------------- #
# Serve the built React app. Mounted last so /api/* takes precedence. If the
# frontend hasn't been built yet, the API still works on its own.
if os.path.isdir(config.FRONTEND_DIST):
    app.mount(
        "/", StaticFiles(directory=config.FRONTEND_DIST, html=True), name="static"
    )
else:
    @app.get("/")
    def _no_frontend():
        return {
            "message": "Frontend not built. Run `npm install && npm run build` "
            "in the frontend/ directory, or use the Vite dev server.",
            "api": "/api/health, /api/ask, /api/export",
        }
