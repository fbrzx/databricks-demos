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
  config.py        env + Genie Space id
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

2. **Point at your Genie Space** (copy the ID from the Genie Space URL):

   ```bash
   export GENIE_SPACE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

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

1. **Build the frontend** so FastAPI can serve it:

   ```bash
   cd frontend && npm install && npm run build && cd ..
   ```

   This produces `frontend/dist/`, which `backend/main.py` serves as static
   files. (Note: `dist/` is git-ignored — make sure it's present in the
   directory you deploy.)

2. **Create the app** (CLI or UI):

   ```bash
   databricks apps create genie-reports
   ```

3. **Sync the code and deploy:**

   ```bash
   databricks sync --full . /Workspace/Users/<you>/genie-reports
   databricks apps deploy genie-reports \
     --source-code-path /Workspace/Users/<you>/genie-reports
   ```

4. **Attach the Genie Space resource** in the app's **Edit** screen:
   **+ Add resource → Genie Space**, pick your space, permission **Can run**,
   resource key **`genie-space`** (matches `app.yaml`).

5. **Grant data access.** The app's service principal needs `USE CATALOG`,
   `USE SCHEMA`, and `SELECT` on the tables the Genie Space queries, plus
   `CAN USE` on its SQL warehouse.

The app starts via the `command` in `app.yaml` (uvicorn on port 8000).

## API

| Method | Path          | Body                                            | Returns                       |
| ------ | ------------- | ----------------------------------------------- | ----------------------------- |
| GET    | `/api/health` | —                                               | `{status}`                    |
| GET    | `/api/config` | —                                               | `{space_configured}`          |
| POST   | `/api/ask`    | `{question, conversation_id?}`                  | `{text, sql, columns, rows, conversation_id, ...}` |
| POST   | `/api/export` | `{columns, rows, format: "csv"\|"xlsx", filename?}` | file download             |

## Notes & limits

- The Genie Conversation API allows ~5 questions/minute/workspace on the free
  tier. Add retry/backoff if you expect heavier use.
- The app reads the first result chunk (up to `GENIE_MAX_ROWS`, default 10k).
  Very large results would need chunk pagination.
- Genie returns tabular data, not rendered charts — the app derives a simple
  bar chart client-side when a label + numeric column are present.
