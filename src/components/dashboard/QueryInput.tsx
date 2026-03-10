import { useState, useRef } from "react";
import { Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UploadedTable } from "@/types/dashboard";

interface QueryInputProps {
  onSubmit: (query: string) => void;
  isLoading: boolean;
  activeTable?: UploadedTable | null;
}

const DEFAULT_QUERIES = [
  "Show revenue by campaign type",
  "Show monthly revenue trend",
  "Compare ROI across marketing channels",
  "Which audience generated the highest conversions?",
  "Show the marketing funnel: impressions → clicks → leads → conversions",
];

export function QueryInput({ onSubmit, isLoading, activeTable }: QueryInputProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = () => {
    if (!query.trim() || isLoading) return;
    onSubmit(query.trim());
    setQuery("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Generate example queries based on active table's columns
  const exampleQueries = activeTable
    ? generateExampleQueries(activeTable)
    : DEFAULT_QUERIES;

  return (
    <div className="space-y-3">
      <div className="relative">
        <textarea
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            activeTable
              ? `Ask about "${activeTable.tableName}" — e.g. "Show total by ${activeTable.columns[0]}"`
              : "Ask a question about your data..."
          }
          className="query-input w-full min-h-[56px] max-h-[120px] resize-none pr-14 text-sm"
          rows={1}
          disabled={isLoading}
        />
        <Button
          onClick={handleSubmit}
          disabled={!query.trim() || isLoading}
          size="icon"
          className="absolute right-2 bottom-2 h-9 w-9 rounded-lg"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {exampleQueries.map((eq) => (
          <button
            key={eq}
            onClick={() => {
              setQuery(eq);
              inputRef.current?.focus();
            }}
            className="text-xs px-3 py-1.5 rounded-full bg-secondary text-secondary-foreground hover:bg-primary/10 hover:text-primary transition-colors duration-150"
            disabled={isLoading}
          >
            {eq}
          </button>
        ))}
      </div>
    </div>
  );
}

function generateExampleQueries(table: UploadedTable): string[] {
  const { tableName, columns, columnTypes } = table;
  const numericCols = columns.filter((c) => ["FLOAT", "BIGINT"].includes(columnTypes[c]));
  const textCols = columns.filter((c) => columnTypes[c] === "TEXT");
  const dateCols = columns.filter((c) => columnTypes[c] === "DATE");

  const examples: string[] = [];

  if (numericCols.length > 0 && textCols.length > 0) {
    examples.push(`Show total ${numericCols[0]} by ${textCols[0]}`);
  }
  if (numericCols.length > 1 && textCols.length > 0) {
    examples.push(`Compare ${numericCols[0]} and ${numericCols[1]} across ${textCols[0]}`);
  }
  if (dateCols.length > 0 && numericCols.length > 0) {
    examples.push(`Show ${numericCols[0]} trend over time`);
  }
  if (textCols.length > 0 && numericCols.length > 0) {
    examples.push(`Which ${textCols[0]} has the highest ${numericCols[0]}?`);
  }
  if (numericCols.length > 0) {
    examples.push(`Show average ${numericCols[0]} grouped by ${textCols[0] || columns[0]}`);
  }

  return examples.slice(0, 5).length > 0 ? examples.slice(0, 5) : DEFAULT_QUERIES;
}
