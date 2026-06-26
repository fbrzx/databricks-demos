// Tiny API client. Same-origin in production; proxied to :8000 in dev.

export async function getConfig() {
  const r = await fetch("/api/config");
  if (!r.ok) throw new Error("Failed to load config");
  return r.json();
}

export async function getSuggestions() {
  const r = await fetch("/api/suggestions");
  if (!r.ok) throw new Error("Failed to load suggestions");
  return r.json();
}

export async function ask(question, conversationId) {
  const r = await fetch("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, conversation_id: conversationId ?? null }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.detail || "Request failed");
  return data;
}

export async function createReport({ question, cardId, conversationId, visualType }) {
  const r = await fetch("/api/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question: question ?? null,
      card_id: cardId ?? null,
      conversation_id: conversationId ?? null,
      visual_type: visualType ?? null,
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.detail || "Report request failed");
  return data;
}

// Streams a file download from the backend.
export async function exportResult(columns, rows, format, filename) {
  const r = await fetch("/api/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ columns, rows, format, filename }),
  });
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw new Error(data.detail || "Export failed");
  }
  await downloadResponse(r, `report.${format}`);
}

export async function exportReportPdf(report, filename) {
  const r = await fetch("/api/export/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...report, filename }),
  });
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw new Error(data.detail || "PDF export failed");
  }
  await downloadResponse(r, "report.pdf");
}

async function downloadResponse(response, fallbackName) {
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^"]+)"?/);
  const name = match ? match[1] : fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
