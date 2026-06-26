import { useEffect, useState } from "react";
import {
  getConfig,
  getSuggestions,
  createReport,
  exportReportPdf,
  exportReportPptx,
  exportResult,
  exportBundle,
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
  const [selected, setSelected] = useState(new Set()); // indices selected for bundle
  const [bundleExporting, setBundleExporting] = useState(null);
  const [bundleError, setBundleError] = useState(null);

  useEffect(() => {
    getConfig()
      .then((c) => { setAppConfig(c); setSpaceConfigured(c.space_configured); })
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
      setHistory((h) => [...h, { question: card ? card.title : text, result }]);
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
    setSelected(new Set());
    setBundleError(null);
  }

  function toggleSelect(idx) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(history.map((_, i) => i)));
  }

  async function exportBundleAs(format) {
    const reports = [...selected].sort().map((i) => history[i].result);
    if (!reports.length) return;
    setBundleExporting(format);
    setBundleError(null);
    try {
      await exportBundle(reports, format, "genie-report-bundle");
    } catch (e) {
      setBundleError(e.message);
    } finally {
      setBundleExporting(null);
    }
  }

  const workspaceLabel = formatWorkspace(appConfig?.workspace_host);
  const spaceLabel = shortSpaceId(appConfig?.space_id);
  const selectedCount = selected.size;

  return (
    <div className="app-shell">
      {/* ── Top navigation bar ────────────────────────────────────────── */}
      <nav className="topnav">
        <div className="topnav-brand">
          <svg className="topnav-logo" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" rx="1" fill="currentColor" opacity="0.9"/>
            <rect x="14" y="3" width="7" height="7" rx="1" fill="currentColor" opacity="0.6"/>
            <rect x="3" y="14" width="7" height="7" rx="1" fill="currentColor" opacity="0.6"/>
            <rect x="14" y="14" width="7" height="7" rx="1" fill="currentColor" opacity="0.9"/>
          </svg>
          <span className="topnav-wordmark">Genie Reports</span>
        </div>

        <div className="topnav-right">
          {(workspaceLabel || spaceLabel) && (
            <div className="connection-pill" title={appConfig?.space_id || ""}>
              <span className="status-dot" aria-hidden="true" />
              {workspaceLabel && <span>{workspaceLabel}</span>}
              {spaceLabel && <span className="space-mono">{spaceLabel}</span>}
            </div>
          )}
          {history.length > 0 && (
            <button className="btn ghost sm" onClick={reset}>New session</button>
          )}
        </div>
      </nav>

      <main className="app-main">
        {/* ── Page heading ──────────────────────────────────────────────── */}
        <header className="page-header">
          <h1>Report Builder</h1>
          <p className="page-subtitle">
            Ask questions in plain English, explore results, then export a polished deck.
          </p>
        </header>

        {!spaceConfigured && (
          <div className="banner warn">
            No Genie Space configured. Set <code>GENIE_SPACE_URL</code> or{" "}
            <code>GENIE_SPACE_ID</code> locally, or attach a Genie Space resource on
            Databricks Apps, then reload.
          </div>
        )}

        {/* ── Ask bar ───────────────────────────────────────────────────── */}
        <div className="ask-section">
          <div className="ask-bar">
            <input
              className="ask-input"
              placeholder={conversationId ? "Ask a follow-up…" : "Ask Genie anything…"}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              disabled={loading}
            />
            <button
              className="btn primary"
              onClick={() => submit()}
              disabled={loading || !question.trim()}
            >
              {loading ? <span className="spinner" /> : null}
              {loading ? "Thinking…" : conversationId ? "Follow up" : "Ask"}
            </button>
          </div>
        </div>

        {error && <div className="banner error">{error}</div>}

        {/* ── Suggestion gallery (empty state) ─────────────────────────── */}
        {history.length === 0 && (
          <section className="suggestion-section" aria-labelledby="suggestions-title">
            {suggestionsLoading ? (
              <div className="skeleton-grid">
                {[...Array(6)].map((_, i) => <div key={i} className="skeleton-card" />)}
              </div>
            ) : suggestions.length > 0 ? (
              <>
                <div className="section-label">
                  <span>Suggested reports</span>
                  <span className="badge">{suggestions.length}</span>
                </div>
                <div className="suggestion-grid">
                  {suggestions.map((s) => (
                    <button
                      key={s.id}
                      className="suggestion-card"
                      onClick={() => submit({ card: s })}
                      disabled={loading}
                    >
                      <span className="suggestion-visual-tag">{formatVisualType(s.visual_type)}</span>
                      <span className="suggestion-title">{s.title}</span>
                      <span className="suggestion-desc">{s.description}</span>
                      <span className="suggestion-export">{formatExportLabel(s.preferred_export)}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </section>
        )}

        {/* ── Report thread ─────────────────────────────────────────────── */}
        {history.length > 0 && (
          <>
            <div className="thread-header">
              <span className="thread-label">
                {history.length} report{history.length !== 1 ? "s" : ""} in session
              </span>
              <div className="thread-actions">
                {selectedCount < history.length && (
                  <button className="btn ghost sm" onClick={selectAll}>Select all</button>
                )}
                {selectedCount > 0 && (
                  <button className="btn ghost sm" onClick={() => setSelected(new Set())}>Clear selection</button>
                )}
              </div>
            </div>

            <div className="thread">
              {history.map((turn, i) => (
                <div key={i} className={`turn ${selected.has(i) ? "turn-selected" : ""}`}>
                  <div className="turn-header">
                    <label className="turn-check-label">
                      <input
                        type="checkbox"
                        className="turn-check"
                        checked={selected.has(i)}
                        onChange={() => toggleSelect(i)}
                        aria-label={`Include "${turn.question}" in bundle`}
                      />
                      <span className="you-badge">You</span>
                      <span className="turn-question-text">{turn.question}</span>
                    </label>
                    <span className="turn-index">#{i + 1}</span>
                  </div>
                  <ResultView
                    result={turn.result}
                    onExport={exportResult}
                    onExportPdf={exportReportPdf}
                    onExportPptx={exportReportPptx}
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </main>

      {/* ── Bundle export tray (sticky bottom) ───────────────────────── */}
      {selectedCount > 0 && (
        <div className="bundle-tray">
          <div className="bundle-tray-inner">
            <div className="bundle-info">
              <svg viewBox="0 0 20 20" fill="currentColor" className="bundle-icon" aria-hidden="true">
                <path d="M2 6a2 2 0 012-2h12a2 2 0 012 2v2a1 1 0 010 2v5a2 2 0 01-2 2H4a2 2 0 01-2-2v-5a1 1 0 010-2V6z"/>
              </svg>
              <strong>{selectedCount} report{selectedCount !== 1 ? "s" : ""}</strong> selected for export
            </div>
            {bundleError && <span className="bundle-error">{bundleError}</span>}
            <div className="bundle-buttons">
              <button
                className="btn bundle-btn"
                disabled={!!bundleExporting}
                onClick={() => exportBundleAs("pdf")}
              >
                {bundleExporting === "pdf" ? "Generating…" : "Export PDF"}
              </button>
              <button
                className="btn bundle-btn"
                disabled={!!bundleExporting}
                onClick={() => exportBundleAs("pptx")}
              >
                {bundleExporting === "pptx" ? "Generating…" : "Export PPTX"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatWorkspace(host) {
  if (!host) return null;
  try { return new URL(host).host; } catch { return host.replace(/^https?:\/\//, ""); }
}

function shortSpaceId(id) {
  if (!id) return null;
  return id.length <= 16 ? id : `${id.slice(0, 8)}…${id.slice(-6)}`;
}

function formatVisualType(value) {
  return (value || "table").replace(/_/g, " ");
}

function formatExportLabel(value) {
  if (!value) return null;
  return value.toUpperCase();
}
