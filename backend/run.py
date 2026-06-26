"""Databricks Apps entrypoint.

Databricks Apps provides the port at runtime via DATABRICKS_APP_PORT. Local
fallbacks keep the same command usable outside Databricks.
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import uvicorn


def main() -> None:
    _ensure_frontend_built()
    port = int(os.getenv("DATABRICKS_APP_PORT", os.getenv("PORT", "8000")))
    uvicorn.run("backend.main:app", host="0.0.0.0", port=port)


def _ensure_frontend_built() -> None:
    root = Path(__file__).resolve().parents[1]
    frontend = root / "frontend"
    dist_index = frontend / "dist" / "index.html"

    if dist_index.exists() or not (frontend / "package.json").exists():
        return

    print("frontend/dist is missing; building React frontend before startup.", flush=True)
    _run(["npm", "--prefix", str(frontend), "ci"], cwd=root)
    _run(["npm", "--prefix", str(frontend), "run", "build"], cwd=root)


def _run(cmd: list[str], cwd: Path) -> None:
    try:
        subprocess.run(cmd, cwd=cwd, check=True)
    except FileNotFoundError as exc:
        raise RuntimeError(
            f"Could not build frontend because `{cmd[0]}` is not available."
        ) from exc
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(
            f"Frontend build command failed with exit code {exc.returncode}: "
            + " ".join(cmd)
        ) from exc


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001 - surface startup failures in app logs
        print(f"Startup failed: {exc}", file=sys.stderr, flush=True)
        raise
