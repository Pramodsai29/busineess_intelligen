import { useState } from "react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  FunnelChart, Funnel, LabelList,
} from "recharts";
import { Table, BarChart2, Download, Code2, ChevronDown, ChevronUp } from "lucide-react";
import type { DashboardResult } from "@/types/dashboard";

const CHART_COLORS = [
  "hsl(230, 80%, 56%)",
  "hsl(172, 66%, 50%)",
  "hsl(280, 60%, 55%)",
  "hsl(35, 90%, 55%)",
  "hsl(340, 75%, 55%)",
  "hsl(195, 80%, 50%)",
  "hsl(60, 80%, 50%)",
  "hsl(15, 85%, 55%)",
];

interface DashboardChartProps {
  result: DashboardResult;
  query: string;
}

function formatNumber(value: unknown): string {
  if (typeof value !== "number") return String(value ?? "");
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(value % 1 === 0 ? 0 : 2);
}

function getKeys(data: Record<string, unknown>[]): { categoryKey: string; valueKeys: string[] } {
  if (!data.length) return { categoryKey: "", valueKeys: [] };
  const keys = Object.keys(data[0]);
  const numericKeys = keys.filter((k) => typeof data[0][k] === "number");
  const stringKeys = keys.filter((k) => typeof data[0][k] === "string");
  const categoryKey = stringKeys[0] || keys[0];
  const valueKeys = numericKeys.length > 0 ? numericKeys : keys.filter((k) => k !== categoryKey);
  return { categoryKey, valueKeys };
}

function exportCSV(data: Record<string, unknown>[], query: string) {
  if (!data || !data.length) return;
  const headers = Object.keys(data[0]);
  const rows = data.map((row) =>
    headers.map((h) => {
      const v = row[h];
      if (typeof v === "string" && (v.includes(",") || v.includes('"'))) return `"${v.replace(/"/g, '""')}"`;
      return v ?? "";
    }).join(",")
  );
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${query.slice(0, 40).replace(/[^a-z0-9]/gi, "_")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function DashboardChart({ result, query }: DashboardChartProps) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const [showSQL, setShowSQL] = useState(false);

  if (!result.data || result.data.length === 0) {
    return (
      <div className="chart-container flex items-center justify-center h-64">
        <p className="text-muted-foreground text-sm">No data to display</p>
      </div>
    );
  }

  const { categoryKey, valueKeys } = getKeys(result.data);
  const chartType = result.chart_type || "bar";
  const columns = Object.keys(result.data[0]);

  const renderChart = () => {
    if (chartType === "funnel") {
      const funnelData = valueKeys.map((key, i) => ({
        name: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        value: result.data!.reduce((sum, row) => sum + (Number(row[key]) || 0), 0),
        fill: CHART_COLORS[i % CHART_COLORS.length],
      }));
      return (
        <ResponsiveContainer width="100%" height={300}>
          <FunnelChart>
            <Tooltip formatter={(v) => formatNumber(v)} />
            <Funnel dataKey="value" data={funnelData} isAnimationActive>
              <LabelList position="right" fill="hsl(var(--foreground))" stroke="none" dataKey="name" />
              <LabelList position="center" fill="hsl(var(--primary-foreground))" stroke="none" dataKey="value" formatter={formatNumber} />
            </Funnel>
          </FunnelChart>
        </ResponsiveContainer>
      );
    }

    if (chartType === "pie") {
      return (
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={result.data!}
              dataKey={valueKeys[0]}
              nameKey={categoryKey}
              cx="50%"
              cy="50%"
              outerRadius={110}
              label={({ name, value }) => `${String(name).slice(0, 12)}: ${formatNumber(value)}`}
              labelLine
            >
              {result.data!.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v) => formatNumber(v)} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      );
    }

    if (chartType === "line") {
      return (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={result.data!} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey={categoryKey} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
            <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickFormatter={formatNumber} />
            <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} formatter={(v) => formatNumber(v)} />
            <Legend />
            {valueKeys.map((key, i) => (
              <Line key={key} type="monotone" dataKey={key} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      );
    }

    return (
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={result.data!} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey={categoryKey} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
          <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickFormatter={formatNumber} />
          <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} formatter={(v) => formatNumber(v)} />
          <Legend />
          {valueKeys.map((key, i) => (
            <Bar key={key} dataKey={key} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  };

  return (
    <div className="chart-container animate-slide-up space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-medium text-foreground leading-snug flex-1">{query}</h3>
        <div className="flex items-center gap-1 shrink-0">
          {/* View toggle */}
          <div className="flex items-center rounded-md border border-border overflow-hidden">
            <button
              onClick={() => setView("chart")}
              className={`px-2 py-1 text-xs flex items-center gap-1 transition-colors ${view === "chart" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <BarChart2 className="h-3 w-3" />
              Chart
            </button>
            <button
              onClick={() => setView("table")}
              className={`px-2 py-1 text-xs flex items-center gap-1 transition-colors ${view === "table" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Table className="h-3 w-3" />
              Table
            </button>
          </div>
          {/* Export CSV */}
          <button
            onClick={() => exportCSV(result.data!, query)}
            title="Export CSV"
            className="p-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Chart or Table */}
      {view === "chart" ? (
        renderChart()
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                {columns.map((col) => (
                  <th key={col} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">
                    {col.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.data!.map((row, i) => (
                <tr key={i} className={`border-b border-border/50 ${i % 2 === 0 ? "" : "bg-muted/20"}`}>
                  {columns.map((col) => (
                    <td key={col} className="px-3 py-2 whitespace-nowrap text-foreground">
                      {typeof row[col] === "number" ? formatNumber(row[col]) : String(row[col] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-3 py-2 text-[10px] text-muted-foreground border-t border-border">
            {result.data!.length} rows
          </div>
        </div>
      )}

      {/* SQL toggle */}
      {result.sql && (
        <div>
          <button
            onClick={() => setShowSQL(!showSQL)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Code2 className="h-3 w-3" />
            {showSQL ? "Hide" : "Show"} SQL
            {showSQL ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {showSQL && (
            <div className="mt-1.5 bg-muted/40 rounded-lg p-2.5 font-mono text-[11px] text-muted-foreground overflow-x-auto">
              {result.sql}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
