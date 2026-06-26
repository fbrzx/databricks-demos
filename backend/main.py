"""FastAPI app: serves the React frontend and proxies questions to a Genie Space.

Run locally:   uvicorn backend.main:app --reload --port 8000
On Databricks:  see app.yaml (command runs uvicorn on port 8000)
"""
from __future__ import annotations

import os
import re
from datetime import datetime
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import config, exporters, report_preview, suggestion_cache
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


class ReportRequest(BaseModel):
    question: str | None = None
    card_id: str | None = None
    conversation_id: str | None = None
    visual_type: str | None = None


class ExportRequest(BaseModel):
    columns: list[str]
    rows: list[list]
    format: str = "csv"  # "csv" | "xlsx"
    filename: str | None = None


class PdfExportRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    narrative: str | None = None
    text: str | None = None
    sql: str | None = None
    chart: dict[str, Any] | None = None
    table: dict[str, Any] | None = None
    columns: list[str] = Field(default_factory=list)
    rows: list[list[Any]] = Field(default_factory=list)
    filename: str | None = None


class BundleExportRequest(BaseModel):
    reports: list[dict[str, Any]]
    format: str = "pdf"  # "pdf" | "pptx"
    filename: str | None = None


class SuggestionsOverrideRequest(BaseModel):
    suggestions: list[Any] | None = None
    raw: str | None = None


# ----- Startup ------------------------------------------------------------- #
@app.on_event("startup")
def load_suggestions_cache():
    suggestion_cache.load_startup_suggestions()


# ----- API routes ---------------------------------------------------------- #
@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/config")
def get_config():
    """Lets the frontend show a helpful message if no space is wired up yet."""
    return {
        "space_configured": bool(config.GENIE_SPACE_ID),
        "workspace_host": config.DATABRICKS_HOST,
        "space_id": config.GENIE_SPACE_ID,
    }


@app.get("/api/suggestions")
def get_suggestions():
    return suggestion_cache.response()


@app.post("/api/suggestions")
def post_suggestions(req: SuggestionsOverrideRequest):
    payload = req.suggestions if req.suggestions is not None else req.raw
    if payload is None:
        raise HTTPException(status_code=400, detail="Provide suggestions or raw JSON.")
    try:
        return suggestion_cache.replace_suggestions(payload, source="manual")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/api/suggestions/refresh")
def post_suggestions_refresh():
    try:
        return suggestion_cache.refresh_from_genie()
    except RuntimeError as exc:  # config problems
        raise HTTPException(status_code=400, detail=str(exc))
    except ValueError as exc:  # malformed/empty Genie response
        raise HTTPException(status_code=502, detail=str(exc))
    except Exception as exc:  # noqa: BLE001 - SDK / network
        raise _genie_http_exception(exc)


@app.post("/api/ask")
def post_ask(req: AskRequest):
    try:
        result = ask(req.question, conversation_id=req.conversation_id)
    except RuntimeError as exc:  # config problems
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:  # noqa: BLE001 - SDK / network
        raise _genie_http_exception(exc)
    return result.to_dict()


@app.post("/api/report")
def post_report(req: ReportRequest):
    template = None
    if req.card_id:
        template = suggestion_cache.get_suggestion(req.card_id)
        if not template:
            raise HTTPException(status_code=404, detail="Unknown report card.")

    prompt = template.prompt if template else (req.question or "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Provide a card_id or question.")

    title = template.title if template else report_preview.title_from_question(prompt)

    try:
        result = ask(prompt, conversation_id=req.conversation_id)
    except RuntimeError as exc:  # config problems
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:  # noqa: BLE001 - SDK / network
        raise _genie_http_exception(exc)

    return report_preview.build_report_preview(
        result,
        title=title,
        prompt=prompt,
        template=template,
        visual_type=req.visual_type,
    )


def _genie_http_exception(exc: Exception) -> HTTPException:
    detail = str(exc)
    if "cannot configure default credentials" in detail or "default auth:" in detail:
        host = config.DATABRICKS_HOST or "your Databricks workspace"
        return HTTPException(
            status_code=401,
            detail=(
                "Databricks authentication is not configured. Run "
                f"`databricks auth login --host {host}` locally, or set "
                "DATABRICKS_HOST and DATABRICKS_TOKEN."
            ),
        )
    return HTTPException(status_code=502, detail=f"Genie request failed: {exc}")


@app.post("/api/export")
def post_export(req: ExportRequest):
    if not req.columns:
        raise HTTPException(status_code=400, detail="No columns to export.")

    base = (
        _safe_filename(req.filename) or f"genie-report-{datetime.now():%Y%m%d-%H%M%S}"
    )

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


@app.post("/api/export/pdf")
def post_export_pdf(req: PdfExportRequest):
    try:
        content = exporters.to_pdf_report(req.model_dump())
    except Exception as exc:  # noqa: BLE001 - export libraries / malformed data
        raise _export_http_exception(exc)
    base = (
        _safe_filename(req.filename or req.title)
        or f"genie-report-{datetime.now():%Y%m%d-%H%M%S}"
    )

    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{base}.pdf"'},
    )


@app.post("/api/export/pptx")
def post_export_pptx(req: PdfExportRequest):
    try:
        content = exporters.to_pptx_report(req.model_dump())
    except Exception as exc:  # noqa: BLE001 - export libraries / malformed data
        raise _export_http_exception(exc)
    base = (
        _safe_filename(req.filename or req.title)
        or f"genie-report-{datetime.now():%Y%m%d-%H%M%S}"
    )
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers={"Content-Disposition": f'attachment; filename="{base}.pptx"'},
    )


@app.post("/api/export/bundle")
def post_export_bundle(req: BundleExportRequest):
    base = (
        _safe_filename(req.filename) or f"genie-bundle-{datetime.now():%Y%m%d-%H%M%S}"
    )
    if req.format == "pptx":
        try:
            content = exporters.to_pptx_bundle(req.reports)
        except Exception as exc:  # noqa: BLE001 - export libraries / malformed data
            raise _export_http_exception(exc)
        media = (
            "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        )
        name = f"{base}.pptx"
    elif req.format == "pdf":
        try:
            content = exporters.to_pdf_bundle(req.reports)
        except Exception as exc:  # noqa: BLE001 - export libraries / malformed data
            raise _export_http_exception(exc)
        media = "application/pdf"
        name = f"{base}.pdf"
    else:
        raise HTTPException(status_code=400, detail="format must be 'pdf' or 'pptx'.")
    return Response(
        content=content,
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


def _export_http_exception(exc: Exception) -> HTTPException:
    if isinstance(exc, ModuleNotFoundError):
        missing = "python-pptx" if exc.name == "pptx" else exc.name
        return HTTPException(
            status_code=500,
            detail=(
                f"Export dependency missing: {missing}. Run "
                "`pip install -r requirements.txt` and restart the app."
            ),
        )
    return HTTPException(status_code=500, detail=f"Export failed: {exc}")


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
            "api": (
                "/api/health, /api/suggestions, /api/suggestions/refresh, "
                "/api/report, /api/ask, /api/export, /api/export/pdf, "
                "/api/export/pptx, /api/export/bundle"
            ),
        }
