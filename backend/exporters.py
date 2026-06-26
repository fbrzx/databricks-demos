"""Turn a columns + rows result into downloadable CSV / Excel bytes."""
from __future__ import annotations

import csv
import io
from typing import Any


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
