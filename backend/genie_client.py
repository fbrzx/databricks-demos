"""Thin wrapper around the Databricks SDK Genie Conversations API.

Normalizes Genie's message/attachment objects into a simple shape the frontend
can consume: narrative text, the generated SQL, and tabular columns + rows.

Authentication is handled by the Databricks SDK's default credential chain:
- On Databricks Apps, the app's service principal credentials are injected
  automatically, so `WorkspaceClient()` needs no arguments.
- Locally, it falls back to your CLI profile / env vars (DATABRICKS_HOST, etc.).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any

from databricks.sdk import WorkspaceClient
from databricks.sdk.service.dashboards import GenieMessage

from . import config


@dataclass
class GenieResult:
    conversation_id: str
    message_id: str
    question: str
    text: str = ""               # Genie's narrative answer
    sql: str | None = None       # generated SQL, if any
    columns: list[str] = field(default_factory=list)
    rows: list[list[Any]] = field(default_factory=list)
    error: str | None = None

    def to_dict(self) -> dict:
        return {
            "conversation_id": self.conversation_id,
            "message_id": self.message_id,
            "question": self.question,
            "text": self.text,
            "sql": self.sql,
            "columns": self.columns,
            "rows": self.rows,
            "row_count": len(self.rows),
            "error": self.error,
        }


@lru_cache(maxsize=1)
def _client() -> WorkspaceClient:
    # Cached so we reuse one authenticated client across requests.
    return WorkspaceClient()


def ask(question: str, conversation_id: str | None = None) -> GenieResult:
    """Ask Genie a question. Starts a new conversation, or continues one if
    `conversation_id` is provided (enables stateful follow-ups)."""
    space_id = config.require_space_id()
    w = _client()

    if conversation_id:
        message: GenieMessage = w.genie.create_message_and_wait(
            space_id=space_id,
            conversation_id=conversation_id,
            content=question,
        )
    else:
        message = w.genie.start_conversation_and_wait(
            space_id=space_id,
            content=question,
        )

    return _normalize(space_id, question, message)


def _normalize(space_id: str, question: str, message: GenieMessage) -> GenieResult:
    conversation_id = message.conversation_id
    message_id = message.id or message.message_id

    result = GenieResult(
        conversation_id=conversation_id,
        message_id=message_id,
        question=question,
    )

    if message.error:
        # Genie surfaces failures on the message itself.
        result.error = getattr(message.error, "error", None) or str(message.error)

    texts: list[str] = []
    query_attachment_id: str | None = None

    for att in message.attachments or []:
        if att.text and att.text.content:
            texts.append(att.text.content)
        if att.query is not None:
            result.sql = att.query.query or result.sql
            query_attachment_id = att.attachment_id

    result.text = "\n\n".join(texts).strip()

    # If Genie produced a SQL query, pull the tabular result so we can render
    # and export it.
    if query_attachment_id or result.sql:
        try:
            _attach_query_result(
                result, space_id, conversation_id, message_id, query_attachment_id
            )
        except Exception as exc:  # noqa: BLE001 - report, don't crash the request
            if not result.error:
                result.error = f"Could not fetch query result: {exc}"

    return result


def _attach_query_result(
    result: GenieResult,
    space_id: str,
    conversation_id: str,
    message_id: str,
    attachment_id: str | None,
) -> None:
    w = _client()
    if attachment_id:
        resp = w.genie.get_message_attachment_query_result(
            space_id=space_id,
            conversation_id=conversation_id,
            message_id=message_id,
            attachment_id=attachment_id,
        )
    else:
        resp = w.genie.get_message_query_result(
            space_id=space_id,
            conversation_id=conversation_id,
            message_id=message_id,
        )

    statement = resp.statement_response
    if statement is None:
        return

    manifest = statement.manifest
    if manifest and manifest.schema and manifest.schema.columns:
        result.columns = [c.name for c in manifest.schema.columns]

    data = statement.result
    if data and data.data_array:
        result.rows = [list(row) for row in data.data_array[: config.MAX_ROWS]]
