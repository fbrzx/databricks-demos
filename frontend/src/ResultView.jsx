import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const MAX_TABLE_ROWS = 100;

export default function ResultView({ result, onExport, onExportPdf }) {
  const {
    title,
    description,
    narrative,
    text,
    sql,
    table = {},
    error,
    question,
  } = result;
  const [showSql, setShowSql] = useState(false);
  const [exporting, setExporting] = useState(null);
  const exportColumns = result.columns?.length ? result.columns : table.columns ?? [];
  const exportRows = result.rows?.length ? result.rows : table.rows ?? [];
  const tableColumns = table.columns?.length ? table.columns : exportColumns;
  const tableRows = table.rows?.length ? table.rows : exportRows.slice(0, MAX_TABLE_ROWS);
  const tableRowCount = table.row_count ?? exportRows.length;
  const previewRowCount = table.preview_row_count ?? tableRows.length;
  const hasTable = tableColumns.length > 0 && tableRows.length > 0;
  const hasPdfExport = result.type === "report" && Boolean(onExportPdf);
  const answerText = narrative ?? text;
  const chart = useMemo(
    () => normalizeChart(result.chart) ?? deriveChart(tableColumns, tableRows),
    [result.chart, tableColumns, tableRows]
  );

  async function doExport(format) {
    setExporting(format);
    try {
      const base = (title || question || "genie-report").slice(0, 40);
      await onExport(exportColumns, exportRows, format, base);
    } catch (e) {
      alert(e.message);
    } finally {
      setExporting(null);
    }
  }

  async function doExportPdf() {
    setExporting("pdf");
    try {
      const base = (title || question || "genie-report").slice(0, 40);
      await onExportPdf(result, base);
    } catch (e) {
      alert(e.message);
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="result">
      {title && (
        <div className="report-heading">
          <h3>{title}</h3>
          {description && <p>{description}</p>}
        </div>
      )}

      {error && <div className="banner error">{error}</div>}
      {answerText && <p className="answer-text">{answerText}</p>}

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
          <ReportChart chart={chart} />
          <div className="chart-caption">
            {chart.valueColumns.join(", ")} by {chart.labelColumn}
          </div>
        </div>
      )}

      {(hasPdfExport || hasTable) && (
        <div className="result-actions">
          {hasTable && (
            <span className="muted">
              {tableRowCount} row{tableRowCount === 1 ? "" : "s"}
            </span>
          )}
          <div className="spacer" />
          {hasPdfExport && (
            <button className="btn small" disabled={exporting} onClick={doExportPdf}>
              {exporting === "pdf" ? "…" : "Download PDF"}
            </button>
          )}
          {hasTable && (
            <>
            <button className="btn small" disabled={exporting} onClick={() => doExport("csv")}>
              {exporting === "csv" ? "…" : "Download CSV"}
            </button>
            <button className="btn small" disabled={exporting} onClick={() => doExport("xlsx")}>
              {exporting === "xlsx" ? "…" : "Download Excel"}
            </button>
            </>
          )}
        </div>
      )}

      {hasTable && (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>{tableColumns.map((c) => <th key={c}>{c}</th>)}</tr>
              </thead>
              <tbody>
                {tableRows.map((row, i) => (
                  <tr key={i}>{row.map((v, j) => <td key={j}>{format(v)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          {tableRowCount > previewRowCount && (
            <p className="muted">
              Showing first {previewRowCount} rows. Download to get all {tableRowCount}.
            </p>
          )}
        </>
      )}

      {!hasTable && !answerText && !error && <p className="muted">No tabular result returned.</p>}
    </div>
  );
}

function ReportChart({ chart }) {
  const colors = ["#6F2531", "#B18A56", "#2F6A4C"];
  const valueColumns = chart.valueColumns;
  const isLine = chart.type === "line";
  const Chart = isLine ? LineChart : BarChart;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <Chart data={chart.data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E6DDCE" />
        <XAxis dataKey="label" tick={{ fontSize: 12 }} interval={0} angle={-15} textAnchor="end" height={50} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip />
        {valueColumns.length > 1 && <Legend />}
        {valueColumns.map((column, index) =>
          isLine ? (
            <Line
              key={column}
              type="monotone"
              dataKey={column}
              stroke={colors[index % colors.length]}
              strokeWidth={2}
              dot={{ r: 2 }}
            />
          ) : (
            <Bar
              key={column}
              dataKey={column}
              fill={colors[index % colors.length]}
              radius={[4, 4, 0, 0]}
            />
          )
        )}
      </Chart>
    </ResponsiveContainer>
  );
}

function format(v) {
  if (v === null || v === undefined) return "";
  return String(v);
}

function normalizeChart(chart) {
  if (!chart?.data?.length) return null;
  const valueColumns = chart.value_columns ?? chart.valueColumns ?? [];
  if (!valueColumns.length) return null;

  return {
    type: chart.type || "bar",
    labelColumn: chart.label_column ?? chart.labelColumn ?? "label",
    valueColumns,
    data: chart.data,
  };
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
    [columns[valueIdx]]: Number(r[valueIdx]) || 0,
  }));

  return {
    data,
    labelColumn: columns[labelIdx],
    type: "bar",
    valueColumns: [columns[valueIdx]],
  };
}
