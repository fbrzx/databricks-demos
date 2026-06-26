"""Databricks Apps entrypoint.

Databricks Apps provides the port at runtime via DATABRICKS_APP_PORT. Local
fallbacks keep the same command usable outside Databricks.
"""
from __future__ import annotations

import os

import uvicorn


def main() -> None:
    port = int(os.getenv("DATABRICKS_APP_PORT", os.getenv("PORT", "8000")))
    uvicorn.run("backend.main:app", host="0.0.0.0", port=port)


if __name__ == "__main__":
    main()
