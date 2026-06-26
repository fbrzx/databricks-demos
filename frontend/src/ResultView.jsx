import { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

const MAX_TABLE_ROWS = 100;

export default function ResultView({ result, onExport }) {
  const { text, sql, columns = [], rows = [], error, question } = result;
  const [showSql, setShowSql] = useState(false);
  const [exporting, setExporting] = useState(null);
  const hasTable = columns.length > 0 && rows.length > 0;
  const chart = useMemo(() => deriveChart(columns, rows), [columns, rows]);

  async function doExport(format) {
    setExporting(format);
    try {
      const base = (question || "genie-report").slice(0, 40);
      await onExport(columns, rows, format, base);
    } catch (e) {
      alert(e.message);
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="result">
      {error && <div className="banner error">{error}</div>}
      {text && <p className="answer-text">{text}</p>}

      {sql && (
        <div className="sql-block">
          <button className="link" onClick={() => setShowSql((v) => !v)}>
            {showSql ? "Hide" : "Show"} generated SQL
          </button>
          {showSql && <pre className="sql">{sql}</pre>}
        </div>
      )}

      {chart && (
        <div className="chart">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chart.data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} interval={0} angle={-15} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="value" fill="#ff5f46" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="chart-caption">{chart.valueCol} by {chart.labelCol}</div>
        </div>
      )}

      {hasTable && (
        <>
          <div className="result-actions">
            <span className="muted">{rows.length} row{rows.length === 1 ? "" : "s"}</span>
            <div className="spacer" />
            <button className="btn small" disabled={exporting} onClick={() => doExport("csv")}>
              {exporting === "csv" ? "…" : "Download CSV"}
            </button>
            <button className="btn small" disabled={exporting} onClick={() => doExport("xlsx")}>
              {exporting === "xlsx" ? "…" : "Download Excel"}
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr>
              </thead>
              <tbody>
                {rows.slice(0, MAX_TABLE_ROWS).map((row, i) => (
                  <tr key={i}>{row.map((v, j) => <td key={j}>{format(v)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > MAX_TABLE_ROWS && (
            <p className="muted">Showing first {MAX_TABLE_ROWS} rows. Download to get all {rows.length}.</p>
          )}
        </>
      )}

      {!hasTable && !text && !error && <p className="muted">No tabular result returned.</p>}
    </div>
  );
}

function format(v) {
  if (v === null || v === undefined) return "";
  return String(v);
}

// Pick a label column (first non-numeric) and a value column (first numeric) to
// auto-render a bar chart. Skip if there's no numeric column or too many rows.
function deriveChart(columns, rows) {
  if (!columns.length || rows.length === 0 || rows.length > 50) return null;

  const isNumeric = columns.map((_, c) =>
    rows.every((r) => r[c] === null || r[c] === "" || !isNaN(Number(r[c])))
  );

  const valueIdx = isNumeric.findIndex((n) => n);
  if (valueIdx === -1) return null;
  let labelIdx = isNumeric.findIndex((n) => !n);
  if (labelIdx === -1) labelIdx = valueIdx === 0 ? 1 : 0;
  if (labelIdx >= columns.length) return null;

  const data = rows.map((r) => ({
    label: String(r[labelIdx] ?? ""),
    value: Number(r[valueIdx]) || 0,
  }));

  return { data, labelCol: columns[labelIdx], valueCol: columns[valueIdx] };
}
