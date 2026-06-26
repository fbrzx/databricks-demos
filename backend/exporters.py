"""Turn a columns + rows result into downloadable CSV / Excel bytes."""
from __future__ import annotations

import csv
import io
from typing import Any
from xml.sax.saxutils import escape


def to_csv(columns: list[str], rows: list[list[Any]]) -> bytes:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(columns)
    writer.writerows(rows)
    return buf.getvalue().encode("utf-8")


def to_xlsx(columns: list[str], rows: list[list[Any]], sheet_name: str = "Report") -> bytes:
    from openpyxl import Workbook
    from openpyxl.styles import Font

    wb = Workbook()
    ws = wb.active
    ws.title = sheet_name[:31] or "Report"

    ws.append(columns)
    for cell in ws[1]:
        cell.font = Font(bold=True)

    for row in rows:
        ws.append(["" if v is None else v for v in row])

    # Reasonable column widths based on header length.
    for i, name in enumerate(columns, start=1):
        ws.column_dimensions[ws.cell(row=1, column=i).column_letter].width = max(
            12, min(40, len(str(name)) + 4)
        )

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def to_pdf_report(report: dict[str, Any]) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.colors import HexColor
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import inch
    from reportlab.platypus import (
        Paragraph,
        SimpleDocTemplate,
        Spacer,
    )

    primary = HexColor("#1A2536")
    base = HexColor("#F8F4EA")
    tan = HexColor("#B18A56")
    burgundy = HexColor("#6F2531")
    green = HexColor("#2F6A4C")
    line = HexColor("#DED3C1")

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=letter,
        rightMargin=0.55 * inch,
        leftMargin=0.55 * inch,
        topMargin=0.75 * inch,
        bottomMargin=0.55 * inch,
        title=_text(report.get("title"), "Genie Report"),
    )

    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="ReportTitle",
            parent=styles["Title"],
            fontSize=22,
            leading=26,
            textColor=primary,
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="SectionTitle",
            parent=styles["Heading2"],
            fontSize=12,
            leading=15,
            textColor=primary,
            spaceBefore=14,
            spaceAfter=6,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Body",
            parent=styles["BodyText"],
            fontSize=9.5,
            leading=13,
            textColor=primary,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Muted",
            parent=styles["BodyText"],
            fontSize=8.5,
            leading=11,
            textColor=colors.HexColor("#637083"),
        )
    )
    styles.add(
        ParagraphStyle(
            name="ReportCode",
            parent=styles["Code"],
            fontName="Courier",
            fontSize=7.5,
            leading=9,
            textColor=base,
            backColor=primary,
            borderPadding=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="TableCell",
            parent=styles["BodyText"],
            fontSize=7.5,
            leading=9,
            textColor=primary,
        )
    )

    story = [
        Paragraph(_paragraph(report.get("title"), "Genie Report"), styles["ReportTitle"]),
    ]

    description = report.get("description")
    if description:
        story.append(Paragraph(_paragraph(description), styles["Muted"]))

    narrative = report.get("narrative") or report.get("text")
    if narrative:
        story.extend(
            [
                Spacer(1, 8),
                Paragraph("Narrative", styles["SectionTitle"]),
                Paragraph(_paragraph(narrative), styles["Body"]),
            ]
        )

    chart = _chart_drawing(report.get("chart"), burgundy, tan, green, primary)
    if chart:
        story.extend([Paragraph("Chart", styles["SectionTitle"]), chart])

    table = _preview_table(report, styles["TableCell"], primary, base, line)
    if table:
        story.extend([Paragraph("Table Excerpt", styles["SectionTitle"]), table])

    sql = report.get("sql")
    if sql:
        story.extend(
            [
                Paragraph("Generated SQL", styles["SectionTitle"]),
                Paragraph(_paragraph(_text(sql)[:2400]), styles["ReportCode"]),
            ]
        )

    def draw_brand(canvas, document):
        width, height = document.pagesize
        canvas.saveState()
        canvas.setFillColor(primary)
        canvas.rect(0, height - 30, width, 30, stroke=0, fill=1)
        canvas.setFillColor(base)
        canvas.setFont("Helvetica-Bold", 9)
        canvas.drawString(document.leftMargin, height - 20, "Genie Reports")
        canvas.setFillColor(tan)
        canvas.rect(0, height - 32, width, 2, stroke=0, fill=1)
        canvas.setFillColor(colors.HexColor("#637083"))
        canvas.setFont("Helvetica", 7)
        canvas.drawRightString(
            width - document.rightMargin,
            18,
            f"Page {document.page}",
        )
        canvas.restoreState()

    doc.build(story, onFirstPage=draw_brand, onLaterPages=draw_brand)
    return buf.getvalue()


def _preview_table(
    report: dict[str, Any],
    cell_style: Any,
    primary: Any,
    base: Any,
    line: Any,
) -> Any | None:
    from reportlab.platypus import Paragraph, Table, TableStyle

    table = report.get("table") or {}
    columns = table.get("columns") or report.get("columns") or []
    rows = table.get("rows") or (report.get("rows") or [])[:10]
    if not columns or not rows:
        return None

    visible_columns = columns[:6]
    visible_rows = rows[:18]
    data = [[Paragraph(_paragraph(column), cell_style) for column in visible_columns]]
    for row in visible_rows:
        data.append(
            [
                Paragraph(_paragraph(_truncate(_cell(row, index), 64)), cell_style)
                for index, _ in enumerate(visible_columns)
            ]
        )

    pdf_table = Table(
        data,
        colWidths=[520 / len(visible_columns)] * len(visible_columns),
        repeatRows=1,
        hAlign="LEFT",
    )
    pdf_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), base),
                ("TEXTCOLOR", (0, 0), (-1, 0), primary),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("GRID", (0, 0), (-1, -1), 0.35, line),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return pdf_table


def _chart_drawing(
    chart: dict[str, Any] | None,
    burgundy: Any,
    tan: Any,
    green: Any,
    primary: Any,
) -> Any | None:
    from reportlab.graphics.shapes import Drawing, Rect, String

    if not chart or not chart.get("data"):
        return None

    value_columns = chart.get("value_columns") or chart.get("valueColumns") or []
    if not value_columns:
        return None

    value_column = value_columns[0]
    data = chart["data"][:8]
    values = [_float(row.get(value_column)) for row in data]
    max_value = max(values) if values else 0
    if max_value <= 0:
        return None

    drawing = Drawing(480, 150)
    bar_left = 125
    bar_max = 280
    bar_height = 11
    row_gap = 17
    colors_for_rows = [burgundy, tan, green]

    for index, row in enumerate(data):
        y = 128 - (index * row_gap)
        value = _float(row.get(value_column))
        width = max(1, (value / max_value) * bar_max)
        label = _truncate(row.get("label"), 24)
        drawing.add(String(0, y + 1, label, fontSize=7.5, fillColor=primary))
        drawing.add(
            Rect(
                bar_left,
                y,
                width,
                bar_height,
                fillColor=colors_for_rows[index % len(colors_for_rows)],
                strokeColor=None,
            )
        )
        drawing.add(
            String(
                bar_left + width + 5,
                y + 1,
                _truncate(value, 14),
                fontSize=7.5,
                fillColor=primary,
            )
        )

    return drawing


def _paragraph(value: Any, default: str = "") -> str:
    return escape(_text(value, default)).replace("\n", "<br/>")


def _text(value: Any, default: str = "") -> str:
    if value is None:
        return default
    return str(value)


def _truncate(value: Any, limit: int) -> str:
    text = _text(value)
    return text if len(text) <= limit else f"{text[: limit - 3]}..."


def _float(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0


def _cell(row: list[Any], index: int) -> Any:
    return row[index] if index < len(row) else None
