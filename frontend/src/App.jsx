import { useEffect, useMemo, useState } from "react";
import {
  getConfig,
  getSuggestions,
  createReport,
  exportReportPdf,
  exportReportPptx,
  exportResult,
  exportBundle,
} from "./api.js";
import ResultView, { MarkdownText } from "./ResultView.jsx";

const REPORT_PROGRESS_STEPS = [
  {
    title: "Preparing prompt",
    detail: "Packaging the question and current chat context.",
  },
  {
    title: "Asking Genie",
    detail: "Waiting for the workspace to return SQL and data.",
  },
  {
    title: "Building preview",
    detail: "Normalizing the answer, table, chart, and narrative.",
  },
  {
    title: "Ready shortly",
    detail: "Finalizing the insight for review.",
  },
];

export default function App() {
  const [question, setQuestion] = useState("");
  const [session, setSession] = useState(() => createSession());
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const [appConfig, setAppConfig] = useState(null);
  const [spaceConfigured, setSpaceConfigured] = useState(true);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(true);
  const [selected, setSelected] = useState(new Set()); // insight IDs selected for bundle
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

  useEffect(() => {
    if (!loading || !progress) return undefined;

    const timer = setInterval(() => {
      setProgress((current) => {
        if (!current) return current;
        return {
          ...current,
          stepIndex: Math.min(
            current.stepIndex + 1,
            REPORT_PROGRESS_STEPS.length - 1
          ),
        };
      });
    }, 1600);

    return () => clearInterval(timer);
  }, [loading, progress?.requestId]);

  const activeChat = useMemo(
    () =>
      session.chats.find((chat) => chat.id === session.activeChatId) ??
      session.chats[0],
    [session]
  );
  const allReports = useMemo(
    () =>
      session.chats.flatMap((chat) =>
        chat.history.map((turn) => ({
          ...turn,
          chatId: chat.id,
          chatTitle: chat.title,
        }))
      ),
    [session.chats]
  );
  const selectedReports = useMemo(
    () => allReports.filter((turn) => selected.has(turn.id)),
    [allReports, selected]
  );
  const totalReports = allReports.length;
  const selectedCount = selectedReports.length;
  const sessionHasWork = totalReports > 0 || session.chats.length > 1 || loading;
  const pendingForActiveChat = progress?.chatId === activeChat?.id;

  async function submit(input) {
    const card = input?.card;
    const text = card ? "" : (input?.question ?? question).trim();
    const chat = activeChat;
    if (!chat || (!card && !text) || loading) return;

    const promptLabel = card ? card.title : text;
    const requestId = makeId("request");

    setLoading(true);
    setProgress({
      chatId: chat.id,
      promptLabel,
      requestId,
      stepIndex: 0,
    });
    setError(null);
    try {
      const result = await createReport({
        question: card ? null : text,
        cardId: card?.id,
        conversationId: chat.conversationId,
        visualType: card?.visual_type,
      });
      const insightId = makeId("insight");
      setSession((current) => ({
        ...current,
        chats: current.chats.map((item) => {
          if (item.id !== chat.id) return item;
          return {
            ...item,
            conversationId: result.conversation_id ?? item.conversationId,
            title: item.history.length ? item.title : titleForChat(promptLabel),
            history: [
              ...item.history,
              { id: insightId, question: promptLabel, result },
            ],
          };
        }),
      }));
      setSelected((current) => {
        const next = new Set(current);
        next.add(insightId);
        return next;
      });
      setQuestion("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }

  function closeSession() {
    setSession(createSession());
    setQuestion("");
    setLoading(false);
    setProgress(null);
    setError(null);
    setSelected(new Set());
    setBundleError(null);
    setBundleExporting(null);
  }

  function startNewChat() {
    if (loading) return;
    const chat = createChat(session.chats.length + 1);
    setSession((current) => ({
      ...current,
      activeChatId: chat.id,
      chats: [...current.chats, chat],
    }));
    setQuestion("");
    setError(null);
  }

  function switchChat(id) {
    setSession((current) => ({ ...current, activeChatId: id }));
    setQuestion("");
    setError(null);
  }

  function toggleSelect(reportId) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(reportId) ? next.delete(reportId) : next.add(reportId);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(allReports.map((turn) => turn.id)));
  }

  async function exportBundleAs(format) {
    const reports = selectedReports.map((turn) => turn.result);
    if (!reports.length) return;
    setBundleExporting(format);
    setBundleError(null);
    try {
      await exportBundle(reports, format, "genie-insight-pack");
      closeSession();
    } catch (e) {
      setBundleError(e.message);
    } finally {
      setBundleExporting(null);
    }
  }

  const workspaceLabel = formatWorkspace(appConfig?.workspace_host);
  const spaceLabel = shortSpaceId(appConfig?.space_id);

  return (
    <div className={`app-shell ${selectedCount > 0 ? "has-bundle" : ""}`}>
      {/* ── Top navigation bar ────────────────────────────────────────── */}
      <nav className="topnav">
        <div className="topnav-brand">
          <svg className="topnav-logo" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" rx="1" fill="currentColor" opacity="0.9"/>
            <rect x="14" y="3" width="7" height="7" rx="1" fill="currentColor" opacity="0.6"/>
            <rect x="3" y="14" width="7" height="7" rx="1" fill="currentColor" opacity="0.6"/>
            <rect x="14" y="14" width="7" height="7" rx="1" fill="currentColor" opacity="0.9"/>
          </svg>
          <span className="topnav-wordmark">Genie Insights</span>
        </div>

        <div className="topnav-right">
          {(workspaceLabel || spaceLabel) && (
            <div className="connection-pill" title={appConfig?.space_id || ""}>
              <span className="status-dot" aria-hidden="true" />
              {workspaceLabel && <span>{workspaceLabel}</span>}
              {spaceLabel && <span className="space-mono">{spaceLabel}</span>}
            </div>
          )}
          {sessionHasWork && (
            <button className="btn topnav-session-btn" onClick={closeSession} disabled={loading}>
              New session
            </button>
          )}
        </div>
      </nav>

      <main className="app-main">
        {/* ── Page heading ──────────────────────────────────────────────── */}
        <header className="page-header">
          <h1>Insight Builder</h1>
          <p className="page-subtitle">
            Ask questions in plain English, collect commentary and data, then export selected material.
          </p>
        </header>

        {!spaceConfigured && (
          <div className="banner warn">
            No Genie Space configured. Set <code>GENIE_SPACE_URL</code> or{" "}
            <code>GENIE_SPACE_ID</code> locally, or attach a Genie Space resource on
            Databricks Apps, then reload.
          </div>
        )}

        {sessionHasWork && (
          <section className="session-strip" aria-label="Current insight session">
            <div className="session-summary">
              <span className="session-label">Session material</span>
              <strong>
                {totalReports} insight{totalReports !== 1 ? "s" : ""}
              </strong>
              <span>
                {session.chats.length} chat{session.chats.length !== 1 ? "s" : ""}
              </span>
            </div>
            <button
              className="btn sm"
              onClick={startNewChat}
              disabled={loading}
            >
              New chat
            </button>
          </section>
        )}

        {sessionHasWork && (
          <div className="chat-tabs" role="tablist" aria-label="Chats in this session">
            {session.chats.map((chat) => {
              const isActive = chat.id === activeChat?.id;
              const isWorking = progress?.chatId === chat.id;
              return (
                <button
                  key={chat.id}
                  className={`chat-tab ${isActive ? "active" : ""}`}
                  onClick={() => switchChat(chat.id)}
                  role="tab"
                  aria-selected={isActive}
                >
                  <span className="chat-tab-title">{chat.title}</span>
                  <span className="chat-tab-meta">
                    {chat.history.length} insight{chat.history.length !== 1 ? "s" : ""}
                    {isWorking ? " / working" : ""}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {error && <div className="banner error">{error}</div>}

        {/* ── Suggestion gallery (empty state) ─────────────────────────── */}
        {activeChat?.history.length === 0 && !pendingForActiveChat && (
          <section className="suggestion-section" aria-labelledby="suggestions-title">
            {suggestionsLoading ? (
              <div className="skeleton-grid">
                {[...Array(6)].map((_, i) => <div key={i} className="skeleton-card" />)}
              </div>
            ) : suggestions.length > 0 ? (
              <>
                <div className="section-label">
                  <span>Suggested starters</span>
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

        {/* ── Insight thread ────────────────────────────────────────────── */}
        {(activeChat?.history.length > 0 || pendingForActiveChat) && (
          <>
            <div className="thread-header">
              <span className="thread-label">
                {activeChat.title} / {activeChat.history.length} insight
                {activeChat.history.length !== 1 ? "s" : ""}
              </span>
              <div className="thread-actions">
                {selectedCount < totalReports && (
                  <button className="btn ghost sm" onClick={selectAll}>Select all</button>
                )}
                {selectedCount > 0 && (
                  <button className="btn ghost sm" onClick={() => setSelected(new Set())}>Clear selection</button>
                )}
              </div>
            </div>

            <div className="thread">
              {activeChat.history.map((turn, i) => (
                <div key={turn.id} className="chat-exchange">
                  <div className="chat-message user-message">
                    <span className="message-label">You</span>
                    <div className="message-bubble user-bubble">
                      {turn.question}
                    </div>
                  </div>

                  {getResultText(turn.result) ? (
                    <div className="chat-message assistant-message">
                      <span className="message-label">Genie</span>
                      <div className="message-bubble assistant-bubble">
                        <MarkdownText text={getResultText(turn.result)} />
                      </div>
                    </div>
                  ) : null}

                  <section
                    className={`insight-artifact ${
                      selected.has(turn.id) ? "artifact-selected" : ""
                    }`}
                    aria-label={`Insight ${i + 1}`}
                  >
                    <div className="artifact-toolbar">
                      <label className="artifact-select">
                        <input
                          type="checkbox"
                          className="artifact-check"
                          checked={selected.has(turn.id)}
                          onChange={() => toggleSelect(turn.id)}
                          aria-label={`Include "${turn.question}" in export bundle`}
                        />
                        <span>Include in export</span>
                      </label>
                      <span className="artifact-index">Insight #{i + 1}</span>
                    </div>
                    <ResultView
                      result={turn.result}
                      onExport={exportResult}
                      onExportPdf={exportReportPdf}
                      onExportPptx={exportReportPptx}
                      showNarrative={false}
                    />
                  </section>
                </div>
              ))}
              {pendingForActiveChat && (
                <ProgressResponse
                  promptLabel={progress.promptLabel}
                  stepIndex={progress.stepIndex}
                />
              )}
            </div>
          </>
        )}
      </main>

      {/* ── Persistent chat composer ──────────────────────────────────── */}
      <footer className="ask-section" aria-label="Ask Genie">
        <div className="ask-bar">
          <input
            className="ask-input"
            placeholder={
              activeChat?.conversationId
                ? "Ask a follow-up..."
                : "Ask Genie anything..."
            }
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
            {loading ? "Generating..." : activeChat?.conversationId ? "Follow up" : "Ask"}
          </button>
        </div>
      </footer>

      {/* ── Bundle export tray (sticky bottom) ───────────────────────── */}
      {selectedCount > 0 && (
        <div className="bundle-tray">
          <div className="bundle-tray-inner">
            <div className="bundle-info">
              <svg viewBox="0 0 20 20" fill="currentColor" className="bundle-icon" aria-hidden="true">
                <path d="M2 6a2 2 0 012-2h12a2 2 0 012 2v2a1 1 0 010 2v5a2 2 0 01-2 2H4a2 2 0 01-2-2v-5a1 1 0 010-2V6z"/>
              </svg>
              <span>
                <strong>
                  {selectedCount} insight{selectedCount !== 1 ? "s" : ""}
                </strong>{" "}
                selected from this session
              </span>
            </div>
            {bundleError && <span className="bundle-error">{bundleError}</span>}
            <div className="bundle-buttons">
              <button
                className="btn bundle-btn"
                disabled={!!bundleExporting}
                onClick={() => exportBundleAs("pdf")}
              >
                {bundleExporting === "pdf" ? "Generating..." : "Download PDF"}
              </button>
              <button
                className="btn bundle-btn"
                disabled={!!bundleExporting}
                onClick={() => exportBundleAs("pptx")}
              >
                {bundleExporting === "pptx" ? "Generating..." : "Download PPTX"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProgressResponse({ promptLabel, stepIndex }) {
  return (
    <div className="chat-exchange pending-exchange">
      <div className="chat-message user-message">
        <span className="message-label">You</span>
        <div className="message-bubble user-bubble">
          {promptLabel}
        </div>
      </div>
      <div className="insight-artifact artifact-pending" aria-live="polite">
        <div className="artifact-toolbar">
          <div className="artifact-status">
            <span className="progress-spinner" aria-hidden="true" />
            <span>Building insight</span>
          </div>
          <span className="artifact-index">Working</span>
        </div>
        <div className="result progress-response">
          <div className="progress-response-heading">
            <strong>{REPORT_PROGRESS_STEPS[stepIndex].title}</strong>
            <span>{REPORT_PROGRESS_STEPS[stepIndex].detail}</span>
          </div>
          <ol className="progress-steps">
            {REPORT_PROGRESS_STEPS.map((step, index) => {
              const state =
                index < stepIndex ? "done" : index === stepIndex ? "active" : "";
              return (
                <li key={step.title} className={state}>
                  <span className="progress-dot" aria-hidden="true" />
                  <div>
                    <strong>{step.title}</strong>
                    <span>{step.detail}</span>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}

function createSession() {
  const firstChat = createChat(1);
  return {
    activeChatId: firstChat.id,
    chats: [firstChat],
  };
}

function createChat(number) {
  return {
    id: makeId("chat"),
    title: `Chat ${number}`,
    conversationId: null,
    history: [],
  };
}

function makeId(prefix) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function titleForChat(prompt) {
  const trimmed = prompt.trim();
  if (!trimmed) return "Chat";
  return trimmed.length > 42 ? `${trimmed.slice(0, 39)}...` : trimmed;
}

function getResultText(result) {
  return result?.narrative ?? result?.text ?? "";
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
