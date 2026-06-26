"""Runtime configuration, read from environment.

On Databricks Apps the Genie Space is attached as a resource and its ID is
injected via the env var declared in app.yaml (`GENIE_SPACE_ID`). Locally you
can either set `GENIE_SPACE_ID` + `DATABRICKS_HOST`, or paste the full Genie
room URL into `GENIE_SPACE_URL`.
"""
import os
import re
from urllib.parse import urlparse

from dotenv import load_dotenv


load_dotenv()

_SPACE_ID_RE = re.compile(
    r"/genie/(?:rooms|spaces)/([0-9a-fA-F-]{32,36})(?:/|$)"
)
_BARE_SPACE_ID_RE = re.compile(r"^[0-9a-fA-F-]{32,36}$")


def _with_scheme(value: str) -> str:
    return value if re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*://", value) else f"https://{value}"


def _normalize_host(value: str | None) -> str | None:
    if not value:
        return None

    parsed = urlparse(_with_scheme(value.strip()))
    if not parsed.netloc:
        return None
    return f"{parsed.scheme}://{parsed.netloc}".rstrip("/")


def _host_from_genie_url(value: str | None) -> str | None:
    if not value:
        return None
    return _normalize_host(value)


def _space_id_from_genie_url(value: str | None) -> str | None:
    if not value:
        return None

    cleaned = value.strip()
    if _BARE_SPACE_ID_RE.fullmatch(cleaned):
        return cleaned

    parsed = urlparse(_with_scheme(cleaned))
    match = _SPACE_ID_RE.search(parsed.path)
    if not match:
        return None
    return match.group(1)


GENIE_SPACE_URL = (
    os.getenv("GENIE_SPACE_URL")
    or os.getenv("DATABRICKS_GENIE_URL")
    or os.getenv("DATABRICKS_GENIE_SPACE_URL")
)

# Workspace the Databricks SDK should talk to when running locally. On
# Databricks Apps the platform injects the workspace/auth context, so this is
# mostly for local development.
DATABRICKS_HOST: str | None = _normalize_host(
    os.getenv("DATABRICKS_HOST")
    or os.getenv("DATABRICKS_WORKSPACE_URL")
    or _host_from_genie_url(GENIE_SPACE_URL)
)

if DATABRICKS_HOST:
    os.environ["DATABRICKS_HOST"] = DATABRICKS_HOST

# Genie Space the app queries. Injected by the Databricks Apps "genie-space"
# resource via app.yaml, set explicitly, or parsed from GENIE_SPACE_URL.
GENIE_SPACE_ID: str | None = os.getenv("GENIE_SPACE_ID") or _space_id_from_genie_url(
    GENIE_SPACE_URL
)

# Where the built frontend lives (vite build output). Served as static files.
FRONTEND_DIST = os.getenv(
    "FRONTEND_DIST",
    os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist"),
)

# Max rows pulled from a Genie query result into the app (single result chunk).
MAX_ROWS = int(os.getenv("GENIE_MAX_ROWS", "10000"))

# Max rows included in the report preview table. The full normalized rows remain
# available to CSV/XLSX export from the same response.
REPORT_MAX_PREVIEW_ROWS = int(os.getenv("REPORT_MAX_PREVIEW_ROWS", "100"))


def require_space_id() -> str:
    if not GENIE_SPACE_ID:
        raise RuntimeError(
            "No Genie Space is configured. On Databricks Apps, add a Genie Space "
            "resource (key 'genie-space'). Locally, set GENIE_SPACE_URL or "
            "export GENIE_SPACE_ID."
        )
    return GENIE_SPACE_ID
