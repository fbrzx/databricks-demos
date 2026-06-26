"""Runtime configuration, read from environment.

On Databricks Apps the Genie Space is attached as a resource and its ID is
injected via the env var declared in app.yaml (`GENIE_SPACE_ID`). Locally you
set it yourself (see .env.example).
"""
import os


# Genie Space the app queries. Injected by the Databricks Apps "genie-space"
# resource via app.yaml, or set manually for local development.
GENIE_SPACE_ID: str | None = os.getenv("GENIE_SPACE_ID")

# Where the built frontend lives (vite build output). Served as static files.
FRONTEND_DIST = os.getenv(
    "FRONTEND_DIST",
    os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist"),
)

# Max rows pulled from a Genie query result into the app (single result chunk).
MAX_ROWS = int(os.getenv("GENIE_MAX_ROWS", "10000"))


def require_space_id() -> str:
    if not GENIE_SPACE_ID:
        raise RuntimeError(
            "GENIE_SPACE_ID is not set. On Databricks Apps, add a Genie Space "
            "resource (key 'genie-space'). Locally, export GENIE_SPACE_ID."
        )
    return GENIE_SPACE_ID
