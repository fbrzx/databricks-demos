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

export default function ResultView({
  result,
  onExport,
  onExportPdf,
  onExportPptx,
  showNarrative = true,
}) {
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
  const hasPptxExport = result.type === "report" && Boolean(onExportPptx);
  const answerText = narrative ?? text;
  const chart = useMemo(
    () => normalizeChart(result.chart) ?? deriveChart(tableColumns, tableRows),
    [result.chart, tableColumns, tableRows]
  );

  async function doExport(format) {
    setExporting(format);
    try {
      const base = (title || question || "genie-insight").slice(0, 40);
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
      const base = (title || question || "genie-insight").slice(0, 40);
      await onExportPdf(result, base);
    } catch (e) {
      alert(e.message);
    } finally {
      setExporting(null);
    }
  }

  async function doExportPptx() {
    setExporting("pptx");
    try {
      const base = (title || question || "genie-insight").slice(0, 40);
      await onExportPptx(result, base);
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
      {showNarrative && answerText && (
        <MarkdownText text={answerText} className="answer-text" />
      )}

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

      {(hasPdfExport || hasPptxExport || hasTable) && (
        <div className="result-actions">
          {hasTable && (
            <span className="muted">
              {tableRowCount} row{tableRowCount === 1 ? "" : "s"}
            </span>
          )}
          <div className="spacer" />
          {hasPdfExport && (
            <button className="btn small" disabled={!!exporting} onClick={doExportPdf}>
              {exporting === "pdf" ? "…" : "PDF"}
            </button>
          )}
          {hasPptxExport && (
            <button className="btn small" disabled={!!exporting} onClick={doExportPptx}>
              {exporting === "pptx" ? "…" : "PPTX"}
            </button>
          )}
          {hasTable && (
            <>
              <button className="btn small" disabled={!!exporting} onClick={() => doExport("csv")}>
                {exporting === "csv" ? "…" : "CSV"}
              </button>
              <button className="btn small" disabled={!!exporting} onClick={() => doExport("xlsx")}>
                {exporting === "xlsx" ? "…" : "Excel"}
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

      {!hasTable && !chart && !sql && !error && (!answerText || !showNarrative) && (
        <p className="muted">No tabular result returned.</p>
      )}
    </div>
  );
}

export function MarkdownText({ text, className = "" }) {
  const blocks = parseMarkdownBlocks(text);
  if (!blocks.length) return null;

  return (
    <div className={`markdown-text ${className}`.trim()}>
      {blocks.map((block, index) => renderMarkdownBlock(block, index))}
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

function parseMarkdownBlocks(text) {
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const code = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        code.push(lines[i]);
        i += 1;
      }
      blocks.push({ type: "code", text: code.join("\n") });
      i += i < lines.length ? 1 : 0;
      continue;
    }

    if (isMarkdownTable(lines, i)) {
      const tableLines = [lines[i]];
      i += 2;
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        tableLines.push(lines[i]);
        i += 1;
      }
      blocks.push({ type: "table", rows: tableLines.map(splitMarkdownTableRow) });
      continue;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1].length,
        text: heading[2].trim(),
      });
      i += 1;
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "list", ordered: false, items });
      continue;
    }

    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+[.)]\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "list", ordered: true, items });
      continue;
    }

    const paragraph = [trimmed];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith("```") &&
      !isMarkdownTable(lines, i) &&
      !/^(#{1,3})\s+/.test(lines[i].trim()) &&
      !/^[-*]\s+/.test(lines[i].trim()) &&
      !/^\d+[.)]\s+/.test(lines[i].trim())
    ) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
  }

  return blocks;
}

function renderMarkdownBlock(block, index) {
  if (block.type === "heading") {
    const Tag = block.level === 1 ? "h4" : block.level === 2 ? "h5" : "h6";
    return <Tag key={index}>{renderInlineMarkdown(block.text, `h-${index}`)}</Tag>;
  }

  if (block.type === "list") {
    const Tag = block.ordered ? "ol" : "ul";
    return (
      <Tag key={index}>
        {block.items.map((item, itemIndex) => (
          <li key={itemIndex}>{renderInlineMarkdown(item, `li-${index}-${itemIndex}`)}</li>
        ))}
      </Tag>
    );
  }

  if (block.type === "code") {
    return (
      <pre key={index} className="markdown-code">
        <code>{block.text}</code>
      </pre>
    );
  }

  if (block.type === "table") {
    const [head, ...body] = block.rows;
    return (
      <div key={index} className="markdown-table-wrap">
        <table>
          <thead>
            <tr>
              {head.map((cell, cellIndex) => (
                <th key={cellIndex}>{renderInlineMarkdown(cell, `th-${index}-${cellIndex}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex}>
                    {renderInlineMarkdown(cell, `td-${index}-${rowIndex}-${cellIndex}`)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return <p key={index}>{renderInlineMarkdown(block.text, `p-${index}`)}</p>;
}

function renderInlineMarkdown(text, keyPrefix) {
  const pattern = /(`[^`]+`|\*\*[^*]+?\*\*|__[^_]+?__|\[[^\]]+?\]\([^)]+?\))/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  let partIndex = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    const key = `${keyPrefix}-${partIndex}`;
    if (token.startsWith("`")) {
      parts.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**") || token.startsWith("__")) {
      parts.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else {
      parts.push(renderMarkdownLink(token, key));
    }

    lastIndex = match.index + token.length;
    partIndex += 1;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

function renderMarkdownLink(token, key) {
  const match = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
  if (!match) return token;

  const href = match[2].trim();
  const isSafeHref = /^(https?:|mailto:)/i.test(href);
  if (!isSafeHref) return match[1];

  return (
    <a key={key} href={href} target="_blank" rel="noreferrer">
      {match[1]}
    </a>
  );
}

function isMarkdownTable(lines, index) {
  const current = lines[index]?.trim();
  const divider = lines[index + 1]?.trim();
  return Boolean(
    current?.includes("|") &&
      divider &&
      /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(divider)
  );
}

function splitMarkdownTableRow(row) {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
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
