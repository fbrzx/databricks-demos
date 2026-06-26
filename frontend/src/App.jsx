import { useEffect, useState } from "react";
import {
  getConfig,
  getSuggestions,
  createReport,
  exportReportPdf,
  exportResult,
} from "./api.js";
import ResultView from "./ResultView.jsx";

export default function App() {
  const [question, setQuestion] = useState("");
  const [conversationId, setConversationId] = useState(null);
  const [history, setHistory] = useState([]); // [{question, result}]
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [appConfig, setAppConfig] = useState(null);
  const [spaceConfigured, setSpaceConfigured] = useState(true);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(true);

  useEffect(() => {
    getConfig()
      .then((c) => {
        setAppConfig(c);
        setSpaceConfigured(c.space_configured);
      })
      .catch(() => {});
    getSuggestions()
      .then((data) => setSuggestions(data.suggestions ?? []))
      .catch(() => setSuggestions([]))
      .finally(() => setSuggestionsLoading(false));
  }, []);

  async function submit(input) {
    const card = input?.card;
    const text = card ? "" : (input?.question ?? question).trim();
    if ((!card && !text) || loading) return;

    setLoading(true);
    setError(null);
    try {
      const result = await createReport({
        question: card ? null : text,
        cardId: card?.id,
        conversationId,
        visualType: card?.visual_type,
      });
      setConversationId(result.conversation_id);
      setHistory((h) => [
        ...h,
        { question: card ? card.title : text, result },
      ]);
      setQuestion("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setConversationId(null);
    setHistory([]);
    setError(null);
  }

  const workspaceLabel = formatWorkspace(appConfig?.workspace_host);
  const spaceLabel = shortSpaceId(appConfig?.space_id);

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Genie Reports</h1>
          <p className="subtitle">Ask questions in plain English. Get tables, charts, and downloads.</p>
          {(workspaceLabel || spaceLabel) && (
            <div className="connection-pill" title={appConfig?.space_id || ""}>
              <span className="status-dot" aria-hidden="true" />
              {workspaceLabel && <span>{workspaceLabel}</span>}
              {spaceLabel && <span className="space-id">{spaceLabel}</span>}
            </div>
          )}
        </div>
        {history.length > 0 && (
          <button className="btn ghost" onClick={reset}>New conversation</button>
        )}
      </header>

      {!spaceConfigured && (
        <div className="banner warn">
          No Genie Space is configured. Set <code>GENIE_SPACE_URL</code> or{" "}
          <code>GENIE_SPACE_ID</code> locally, or attach a Genie Space resource
          on Databricks Apps, then reload.
        </div>
      )}

      <div className="ask-bar">
        <input
          className="ask-input"
          placeholder={conversationId ? "Ask a follow-up…" : "Ask Genie a question…"}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          disabled={loading}
        />
        <button className="btn primary" onClick={() => submit()} disabled={loading || !question.trim()}>
          {loading ? "Thinking…" : conversationId ? "Follow up" : "Ask"}
        </button>
      </div>

      {history.length === 0 && suggestions.length > 0 && (
        <section className="suggestion-gallery" aria-labelledby="suggestions-title">
          <div className="section-heading">
            <h2 id="suggestions-title">Suggested Reports</h2>
            <span className="muted">{suggestions.length} starters</span>
          </div>
          <div className="suggestion-grid">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.id}
                className="suggestion-card"
                onClick={() => submit({ card: suggestion })}
                disabled={loading}
              >
                <span className="suggestion-title">{suggestion.title}</span>
                <span className="suggestion-description">{suggestion.description}</span>
                <span className="suggestion-meta">
                  <span>{formatVisualType(suggestion.visual_type)}</span>
                  <span>{formatExport(suggestion.preferred_export)}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {history.length === 0 && suggestionsLoading && (
        <div className="suggestions-placeholder">Loading report starters...</div>
      )}

      {error && <div className="banner error">{error}</div>}

      <div className="thread">
        {history.map((turn, i) => (
          <div key={i} className="turn">
            <div className="turn-question">
              <span className="you">You</span>
              {turn.question}
            </div>
            <ResultView
              result={turn.result}
              onExport={exportResult}
              onExportPdf={exportReportPdf}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function formatWorkspace(host) {
  if (!host) return null;
  try {
    return new URL(host).host;
  } catch {
    return host.replace(/^https?:\/\//, "");
  }
}

function shortSpaceId(spaceId) {
  if (!spaceId) return null;
  if (spaceId.length <= 16) return spaceId;
  return `${spaceId.slice(0, 8)}...${spaceId.slice(-6)}`;
}

function formatVisualType(value) {
  return (value || "table").replace(/_/g, " ");
}

function formatExport(value) {
  if (!value) return "Export";
  return `target ${value.toUpperCase()}`;
}
