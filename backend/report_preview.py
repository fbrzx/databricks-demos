"""Normalize Genie responses into report preview payloads."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from . import config
from .genie_client import GenieResult
from .report_templates import ReportTemplate


def build_report_preview(
    result: GenieResult,
    *,
    title: str,
    prompt: str,
    template: ReportTemplate | None = None,
    visual_type: str | None = None,
) -> dict[str, Any]:
    columns = result.columns
    rows = result.rows
    preview_rows = rows[: config.REPORT_MAX_PREVIEW_ROWS]
    chart = _derive_chart(columns, preview_rows, visual_type or template_visual_type(template))

    return {
        "type": "report",
        "id": template.id if template else None,
        "title": title,
        "description": template.description if template else None,
        "prompt": prompt,
        "question": result.question,
        "narrative": result.text,
        "text": result.text,
        "sql": result.sql,
        "columns": columns,
        "rows": rows,
        "row_count": len(rows),
        "table": {
            "columns": columns,
            "rows": preview_rows,
            "row_count": len(rows),
            "preview_row_count": len(preview_rows),
        },
        "chart": chart,
        "preferred_export": template.preferred_export if template else None,
        "visual_type": chart["type"] if chart else (visual_type or template_visual_type(template)),
        "conversation_id": result.conversation_id,
        "message_id": result.message_id,
        "error": result.error,
        "audit": {
            "card_id": template.id if template else None,
            "genie_prompt": prompt,
            "row_count": len(rows),
            "export_timestamp": None,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        },
    }


def template_visual_type(template: ReportTemplate | None) -> str | None:
    return template.visual_type if template else None


def title_from_question(question: str) -> str:
    cleaned = " ".join(question.strip().split())
    if not cleaned:
        return "Custom Report"
    title = cleaned.rstrip("?.!")
    if len(title) <= 64:
        return title
    return f"{title[:61].rstrip()}..."


def _derive_chart(
    columns: list[str],
    rows: list[list[Any]],
    preferred_type: str | None,
) -> dict[str, Any] | None:
    if not columns or not rows:
        return None

    numeric_indexes = [
        index for index, _ in enumerate(columns) if _is_numeric_column(rows, index)
    ]
    if not numeric_indexes:
        return None

    label_index = _first_label_index(columns, numeric_indexes)
    if label_index is None:
        return None

    chart_type = _normalize_chart_type(preferred_type)
    value_indexes = numeric_indexes[:3] if chart_type == "grouped_bar" else numeric_indexes[:1]
    data = []

    for row in rows[:50]:
        item = {"label": _string_value(_cell(row, label_index))}
        for value_index in value_indexes:
            item[columns[value_index]] = _number_value(_cell(row, value_index))
        data.append(item)

    return {
        "type": chart_type,
        "label_column": columns[label_index],
        "value_columns": [columns[index] for index in value_indexes],
        "data": data,
    }


def _normalize_chart_type(value: str | None) -> str:
    if value in {"line", "bar", "grouped_bar"}:
        return value
    return "bar"


def _first_label_index(columns: list[str], numeric_indexes: list[int]) -> int | None:
    for index in range(len(columns)):
        if index not in numeric_indexes:
            return index

    return 1 if len(columns) > 1 and numeric_indexes[0] == 0 else 0


def _is_numeric_column(rows: list[list[Any]], index: int) -> bool:
    values = [_cell(row, index) for row in rows]
    non_empty = [value for value in values if value not in (None, "")]
    if not non_empty:
        return False
    return all(_is_number(value) for value in non_empty)


def _is_number(value: Any) -> bool:
    if isinstance(value, bool):
        return False
    try:
        float(value)
    except (TypeError, ValueError):
        return False
    return True


def _number_value(value: Any) -> float:
    if value in (None, ""):
        return 0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0


def _string_value(value: Any) -> str:
    return "" if value is None else str(value)


def _cell(row: list[Any], index: int) -> Any:
    return row[index] if index < len(row) else None
