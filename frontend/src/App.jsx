import { useEffect, useState } from "react";
import { getConfig, ask, exportResult } from "./api.js";
import ResultView from "./ResultView.jsx";

const SUGGESTIONS = [
  "What were total sales last month?",
  "Show the top 10 customers by revenue",
  "Compare revenue by region this year vs last year",
];

export default function App() {
  const [question, setQuestion] = useState("");
  const [conversationId, setConversationId] = useState(null);
  const [history, setHistory] = useState([]); // [{question, result}]
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [spaceConfigured, setSpaceConfigured] = useState(true);

  useEffect(() => {
    getConfig()
      .then((c) => setSpaceConfigured(c.space_configured))
      .catch(() => {});
  }, []);

  async function submit(q) {
    const text = (q ?? question).trim();
    if (!text || loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await ask(text, conversationId);
      setConversationId(result.conversation_id);
      setHistory((h) => [...h, { question: text, result }]);
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

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Genie Reports</h1>
          <p className="subtitle">Ask questions in plain English. Get tables, charts, and downloads.</p>
        </div>
        {history.length > 0 && (
          <button className="btn ghost" onClick={reset}>New conversation</button>
        )}
      </header>

      {!spaceConfigured && (
        <div className="banner warn">
          No Genie Space is configured. Set <code>GENIE_SPACE_ID</code> (locally) or
          attach a Genie Space resource (on Databricks Apps), then reload.
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

      {history.length === 0 && (
        <div className="suggestions">
          <span className="suggestions-label">Try:</span>
          {SUGGESTIONS.map((s) => (
            <button key={s} className="chip" onClick={() => submit(s)} disabled={loading}>
              {s}
            </button>
          ))}
        </div>
      )}

      {error && <div className="banner error">{error}</div>}

      <div className="thread">
        {history.map((turn, i) => (
          <div key={i} className="turn">
            <div className="turn-question">
              <span className="you">You</span>
              {turn.question}
            </div>
            <ResultView result={turn.result} onExport={exportResult} />
          </div>
        ))}
      </div>
    </div>
  );
}
