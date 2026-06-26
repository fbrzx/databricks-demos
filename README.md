# Genie Reports

A small web app that turns plain-English questions into reports by talking to a
**Databricks Genie Space**. Ask a question, Genie generates and runs the SQL
against your Unity Catalog data, and the app renders the answer as text, a table,
and an auto-chart — with one-click **CSV / Excel download**.

- **Backend:** FastAPI + the Databricks Python SDK (`WorkspaceClient.genie`)
- **Frontend:** Vite + React (Recharts for charts)
- **Hosting:** [Databricks Apps](https://docs.databricks.com/aws/en/dev-tools/databricks-apps/) (serverless, Python 3.11)

## How it works

```
Browser ──> FastAPI (/api/ask) ──> WorkspaceClient.genie.start_conversation_and_wait
   ^                                          │
   │                                          ▼
   └──── table + chart + download ◄── Genie generates SQL, runs it on a SQL
                                       warehouse, returns rows
```

The app holds a `conversation_id` so follow-up questions keep Genie's context.
On Databricks, the app authenticates as its **service principal**; the attached
Genie Space resource injects `GENIE_SPACE_ID` and grants `Can run`.

## Project layout

```
backend/
  main.py          FastAPI: /api/ask, /api/export, serves the built frontend
  genie_client.py  SDK wrapper -> normalized {text, sql, columns, rows}
  exporters.py     CSV / XLSX generation
  config.py        env + Genie Space URL/host/id parsing
frontend/
  src/App.jsx      question input, suggestions, conversation thread
  src/ResultView.jsx  table, auto bar-chart, SQL toggle, download buttons
app.yaml           Databricks Apps run command + Genie resource wiring
requirements.txt   Python deps
```

## Run locally

You need: Python 3.11+, Node 18+, and access to a Databricks workspace with a
Genie Space.

1. **Authenticate** to Databricks (the SDK uses your CLI profile):

   ```bash
   databricks auth login --host https://your-workspace.cloud.databricks.com
   ```

2. **Point at your Genie Space**. You can paste the full Genie room URL into
   `.env`; the app derives both the Databricks host and Space ID from it:

   ```bash
   cp .env.example .env
   # edit .env:
   GENIE_SPACE_URL=https://your-workspace.cloud.databricks.com/genie/rooms/<space-id>?o=<workspace-id>
   ```

   Alternatively, set `DATABRICKS_HOST` and `GENIE_SPACE_ID` directly.

3. **Backend** (terminal 1):

   ```bash
   pip install -r requirements.txt
   uvicorn backend.main:app --reload --port 8000
   ```

4. **Frontend** (terminal 2):

   ```bash
   cd frontend
   npm install
   npm run dev          # http://localhost:5173 (proxies /api to :8000)
   ```

Open http://localhost:5173. (You can also build the frontend and let FastAPI
serve everything from http://localhost:8000 — see below.)

## Deploy to Databricks Apps

1. **Authenticate to the target workspace:**

   ```bash
   databricks auth login --host https://your-workspace.cloud.databricks.com
   ```

2. **Deploy with the Makefile shortcut:**

   ```bash
   make deploy
   ```

   By default this creates/deploys an app named `genie-reports`, stages a clean
   deploy folder at `/tmp/genie-reports-deploy`, syncs it to
   `/Workspace/Users/$USER/genie-reports`, and deploys from that workspace path.
   Override those when needed:

   ```bash
   make deploy APP_NAME=my-genie-app \
     DEPLOY_PATH=/Workspace/Users/<you>/my-genie-app
   ```

   The shortcut builds `frontend/dist/` and stages only deployable files, so
   local-only files such as `.env`, `.venv`, and `node_modules` are not synced.

   If this repo is already imported as a Databricks Git folder and you have
   pulled the latest commit there, deploy directly from that Workspace path:

   ```bash
   make deploy-from-workspace \
     WORKSPACE_SOURCE=/Workspace/Users/<you>/<repo-folder>
   ```

   The root `package.json` delegates its build to `frontend/`, so Databricks
   Apps can build the Vite frontend from the Git folder before starting the
   FastAPI app. If the deployment starts without `frontend/dist`, `backend.run`
   also builds the frontend once at startup before launching FastAPI.

3. **Attach the Genie Space resource** in the app's **Edit** screen:
   **+ Add resource → Genie Space**, pick your space, permission **Can run**,
   resource key **`genie-space`** (matches `app.yaml`).

4. **Grant data access.** The app's service principal needs `USE CATALOG`,
   `USE SCHEMA`, and `SELECT` on the tables the Genie Space queries, plus
   `CAN USE` on its SQL warehouse.

Useful deploy targets:

- `make deploy-info` shows the current app name and workspace path.
- `make deploy-stage` only builds and stages the deploy folder.
- `make deploy-from-workspace` deploys from an existing Databricks Workspace or
  Git folder path without local sync.
- `make deploy-logs` follows Databricks app logs.

The app starts via the `command` in `app.yaml`; `backend.run` ensures
`frontend/dist` exists, reads `DATABRICKS_APP_PORT` in Databricks, and falls
back to port 8000 locally.

## API

| Method | Path          | Body                                            | Returns                       |
| ------ | ------------- | ----------------------------------------------- | ----------------------------- |
| GET    | `/api/health` | —                                               | `{status}`                    |
| GET    | `/api/config` | —                                               | `{space_configured, workspace_host, space_id}` |
| POST   | `/api/ask`    | `{question, conversation_id?}`                  | `{text, sql, columns, rows, conversation_id, ...}` |
| POST   | `/api/export` | `{columns, rows, format: "csv"\|"xlsx", filename?}` | file download             |

## Notes & limits

- The Genie Conversation API allows ~5 questions/minute/workspace on the free
  tier. Add retry/backoff if you expect heavier use.
- The app reads the first result chunk (up to `GENIE_MAX_ROWS`, default 10k).
  Very large results would need chunk pagination.
- Genie returns tabular data, not rendered charts — the app derives a simple
  bar chart client-side when a label + numeric column are present.
