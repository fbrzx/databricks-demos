"""Cached starter suggestions for the report builder.

The app keeps starter cards in memory so the suggestion endpoint is cheap.
Manual JSON/file overrides can hydrate this cache for demos. A Genie refresh is
available on demand, but startup refresh is opt-in so app boot stays fast.
"""
from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock
from typing import Any

from . import config, report_templates
from .genie_client import ask
from .report_templates import ReportTemplate


LOG = logging.getLogger(__name__)

DEFAULT_STARTERS_PROMPT = """
Suggest 6 useful starter report cards for this Genie Space.

Return only valid JSON. The top-level value must be an array. Each object must
include these fields:
- title
- description
- prompt
- visual_type: one of "line", "bar", "grouped_bar", or "table"
- preferred_export: one of "pdf", "pptx", or "xlsx"
- required_columns: an array of expected result column names, if known

Use concise business language and prompts that match the actual measures,
dimensions, and entities available in this Genie Space.
""".strip()

_MANUAL_JSON_ENV_NAMES = ("GENIE_STARTERS_JSON", "GENIE_SUGGESTIONS_JSON")
_MANUAL_FILE_ENV_NAMES = ("GENIE_STARTERS_FILE", "GENIE_SUGGESTIONS_FILE")
_TRUTHY = {"1", "true", "yes", "on"}
_FALSY = {"0", "false", "no", "off"}
_VISUAL_TYPES = {"line", "bar", "grouped_bar", "table"}
_EXPORT_TYPES = {"pdf", "pptx", "xlsx"}


@dataclass
class SuggestionCache:
    suggestions: list[ReportTemplate] = field(
        default_factory=lambda: list(report_templates.REPORT_TEMPLATES)
    )
    source: str = "curated"
    cached_at: str | None = None
    last_error: str | None = None


_cache = SuggestionCache()
_lock = RLock()


def load_startup_suggestions() -> dict[str, Any]:
    """Hydrate the cache once during app startup.

    Manual JSON/file overrides take precedence so demos can be made repeatable.
    Otherwise, the app only queries Genie when startup refresh is explicitly
    enabled and a space is configured. All failures are non-fatal; the curated
    templates remain usable.
    """
    try:
        payload, source = _manual_payload()
        if payload is not None:
            return replace_suggestions(payload, source=source)

        if not _refresh_on_startup() or not config.GENIE_SPACE_ID:
            return response()

        return refresh_from_genie()
    except Exception as exc:  # noqa: BLE001 - startup should not fail the app
        LOG.warning("Could not hydrate starter suggestions: %s", exc)
        with _lock:
            _cache.last_error = str(exc)
        return response()


def response() -> dict[str, Any]:
    with _lock:
        return {
            "suggestions": [template.to_dict() for template in _cache.suggestions],
            "source": _cache.source,
            "cached_at": _cache.cached_at,
            "last_error": _cache.last_error,
        }


def list_suggestions() -> list[dict[str, Any]]:
    return response()["suggestions"]


def get_suggestion(template_id: str) -> ReportTemplate | None:
    with _lock:
        return next(
            (template for template in _cache.suggestions if template.id == template_id),
            None,
        )


def refresh_from_genie() -> dict[str, Any]:
    """Query Genie for starter cards and replace the cache with the result."""
    prompt = os.getenv("GENIE_STARTERS_PROMPT", DEFAULT_STARTERS_PROMPT).strip()
    result = ask(prompt)
    text = result.text.strip()
    if not text:
        raise ValueError("Genie returned no starter suggestions.")

    return replace_suggestions(text, source="genie")


def replace_suggestions(payload: Any, *, source: str = "manual") -> dict[str, Any]:
    templates = parse_suggestions(payload)
    if not templates:
        raise ValueError("No valid starter suggestions were provided.")

    with _lock:
        _cache.suggestions = templates
        _cache.source = source
        _cache.cached_at = datetime.now(timezone.utc).isoformat()
        _cache.last_error = None

    return response()


def parse_suggestions(payload: Any) -> list[ReportTemplate]:
    parsed = _coerce_json_payload(payload)
    if isinstance(parsed, dict):
        parsed = parsed.get("suggestions") or parsed.get("starters") or parsed.get("cards")

    if not isinstance(parsed, list):
        raise ValueError("Starter suggestions must be a JSON array or an object with suggestions.")

    max_count = _starter_limit()
    templates: list[ReportTemplate] = []
    seen_ids: set[str] = set()

    for index, item in enumerate(parsed[:max_count], start=1):
        template = _template_from_item(item, index, seen_ids)
        if template:
            templates.append(template)

    return templates


def _manual_payload() -> tuple[Any | None, str]:
    for env_name in _MANUAL_JSON_ENV_NAMES:
        value = os.getenv(env_name)
        if value and value.strip():
            return value, f"env:{env_name}"

    for env_name in _MANUAL_FILE_ENV_NAMES:
        value = os.getenv(env_name)
        if value and value.strip():
            path = Path(value).expanduser()
            return path.read_text(encoding="utf-8"), f"file:{path}"

    return None, "manual"


def _refresh_on_startup() -> bool:
    value = os.getenv("GENIE_STARTERS_REFRESH_ON_STARTUP", "false").strip().lower()
    if value in _FALSY:
        return False
    if value in _TRUTHY:
        return True
    return False


def _starter_limit() -> int:
    raw = os.getenv("GENIE_STARTERS_LIMIT", "8")
    try:
        return max(1, int(raw))
    except ValueError:
        return 8


def _coerce_json_payload(payload: Any) -> Any:
    if isinstance(payload, str):
        text = payload.strip()
        if not text:
            raise ValueError("Starter suggestions payload is empty.")

        try:
            return json.loads(text)
        except json.JSONDecodeError:
            extracted = _extract_json(text)
            if extracted is None:
                raise ValueError("Starter suggestions must be valid JSON.") from None
            return json.loads(extracted)

    return payload


def _extract_json(text: str) -> str | None:
    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text, flags=re.IGNORECASE)
    if fenced:
        return fenced.group(1).strip()

    array_start = text.find("[")
    array_end = text.rfind("]")
    if array_start >= 0 and array_end > array_start:
        return text[array_start : array_end + 1]

    object_start = text.find("{")
    object_end = text.rfind("}")
    if object_start >= 0 and object_end > object_start:
        return text[object_start : object_end + 1]

    return None


def _template_from_item(
    item: Any, index: int, seen_ids: set[str]
) -> ReportTemplate | None:
    if isinstance(item, str):
        prompt = _clean_text(item)
        title = _title_from_prompt(prompt)
        description = prompt
        raw: dict[str, Any] = {}
    elif isinstance(item, dict):
        raw = item
        prompt = _clean_text(
            raw.get("prompt")
            or raw.get("question")
            or raw.get("starter")
            or raw.get("query")
        )
        if not prompt:
            return None
        title = _clean_text(raw.get("title") or raw.get("name")) or _title_from_prompt(prompt)
        description = _clean_text(raw.get("description") or raw.get("summary")) or prompt
    else:
        return None

    template_id = _unique_id(
        _clean_text(raw.get("id") if isinstance(item, dict) else None) or title,
        index,
        seen_ids,
    )

    return ReportTemplate(
        id=template_id,
        title=title[:80],
        description=description[:180],
        prompt=prompt,
        visual_type=_normalize_visual_type(raw.get("visual_type") or raw.get("chart_type")),
        preferred_export=_normalize_export(raw.get("preferred_export") or raw.get("export")),
        required_columns=_normalize_required_columns(raw.get("required_columns") or raw.get("columns")),
    )


def _clean_text(value: Any) -> str:
    if value is None:
        return ""
    return " ".join(str(value).strip().split())


def _title_from_prompt(prompt: str) -> str:
    title = prompt.rstrip("?.!")
    if len(title) <= 52:
        return title
    return f"{title[:49].rstrip()}..."


def _unique_id(value: str, index: int, seen_ids: set[str]) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-") or f"starter-{index}"
    base = base[:48].strip("-") or f"starter-{index}"
    candidate = base
    suffix = 2
    while candidate in seen_ids:
        candidate = f"{base}-{suffix}"
        suffix += 1
    seen_ids.add(candidate)
    return candidate


def _normalize_visual_type(value: Any) -> str:
    cleaned = _clean_text(value).lower().replace("-", "_")
    return cleaned if cleaned in _VISUAL_TYPES else "bar"


def _normalize_export(value: Any) -> str:
    cleaned = _clean_text(value).lower()
    return cleaned if cleaned in _EXPORT_TYPES else "pptx"


def _normalize_required_columns(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        candidates = re.split(r"[,;\n]", value)
    elif isinstance(value, list):
        candidates = value
    else:
        return []
    return [_clean_text(item) for item in candidates if _clean_text(item)]
