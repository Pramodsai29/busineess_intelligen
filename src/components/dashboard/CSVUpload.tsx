import { useState, useRef } from "react";
import { Upload, FileText, Loader2, CheckCircle, X, Table2, ChevronDown, ChevronUp, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadCSV } from "@/lib/api";
import { toast } from "sonner";
import type { UploadedTable } from "@/types/dashboard";

interface CSVUploadProps {
  onTableUploaded: (table: UploadedTable) => void;
  uploadedTables: UploadedTable[];
  activeTable: UploadedTable | null;
  onSelectTable: (table: UploadedTable | null) => void;
}

function sanitizeTableName(fileName: string): string {
  return fileName
    .replace(/\.csv$/i, "")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .substring(0, 40) || "uploaded_data";
}

export function CSVUpload({ onTableUploaded, uploadedTables, activeTable, onSelectTable }: CSVUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [replaceData, setReplaceData] = useState(false);
  const [expandedTable, setExpandedTable] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".csv")) {
      toast.error("Please upload a CSV file.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large. Maximum 10MB.");
      return;
    }

    const tableName = sanitizeTableName(file.name);
    setIsUploading(true);

    try {
      const text = await file.text();
      const result = await uploadCSV(text, tableName, replaceData);

      if (result.error) {
        toast.error(result.error);
      } else {
        const tableResult = result as UploadedTable;
        tableResult.fileName = file.name;
        onTableUploaded(tableResult);
        onSelectTable(tableResult);
        toast.success(`✓ Uploaded ${result.rowsInserted} rows to table "${result.tableName}"`);
        toast.info(`Detected ${result.columns.length} columns. Ready to query!`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const typeColor = (type: string) => {
    if (type === "FLOAT" || type === "BIGINT") return "text-blue-400";
    if (type === "DATE") return "text-green-400";
    if (type === "BOOLEAN") return "text-purple-400";
    return "text-muted-foreground";
  };

  return (
    <div className="glass-card p-4 space-y-3 h-full">
      <div className="flex items-center gap-2">
        <Database className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Data Sources</span>
      </div>

      {/* Upload area */}
      <div className="border border-dashed border-border rounded-lg p-3 space-y-2 hover:border-primary/50 transition-colors">
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={replaceData}
            onChange={(e) => setReplaceData(e.target.checked)}
            className="rounded border-border"
          />
          Replace existing data
        </label>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileSelect}
          className="hidden"
        />

        <Button
          variant="outline"
          className="w-full gap-2 text-xs h-8"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
        >
          {isUploading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <Upload className="h-3.5 w-3.5" />
              Upload CSV
            </>
          )}
        </Button>
        <p className="text-[10px] text-muted-foreground text-center">
          Any CSV — columns auto-detected
        </p>
      </div>

      {/* Uploaded tables list */}
      {uploadedTables.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            Loaded Tables ({uploadedTables.length})
          </p>
          {uploadedTables.map((table) => (
            <div
              key={table.tableName}
              className={`rounded-lg border text-xs transition-colors ${
                activeTable?.tableName === table.tableName
                  ? "border-primary/60 bg-primary/5"
                  : "border-border bg-surface-sunken hover:border-primary/30"
              }`}
            >
              <div
                className="flex items-center justify-between p-2.5 cursor-pointer"
                onClick={() => onSelectTable(activeTable?.tableName === table.tableName ? null : table)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Table2 className="h-3.5 w-3.5 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium truncate">{table.tableName}</p>
                    <p className="text-[10px] text-muted-foreground">{table.rowsInserted} rows · {table.columns.length} cols</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {activeTable?.tableName === table.tableName && (
                    <span className="text-[9px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-medium">ACTIVE</span>
                  )}
                  <button
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setExpandedTable(expandedTable === table.tableName ? null : table.tableName);
                    }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {expandedTable === table.tableName
                      ? <ChevronUp className="h-3 w-3" />
                      : <ChevronDown className="h-3 w-3" />
                    }
                  </button>
                </div>
              </div>

              {/* Column schema preview */}
              {expandedTable === table.tableName && (
                <div className="border-t border-border px-2.5 pb-2.5 pt-2 space-y-1 max-h-40 overflow-y-auto">
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1.5">Schema</p>
                  {table.columns.map((col) => (
                    <div key={col} className="flex items-center justify-between gap-2">
                      <span className="text-foreground font-mono">{col}</span>
                      <span className={`text-[10px] font-mono ${typeColor(table.columnTypes[col])}`}>
                        {table.columnTypes[col]}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Default table hint */}
      {uploadedTables.length === 0 && (
        <div className="rounded-lg border border-border bg-surface-sunken p-2.5">
          <div className="flex items-center gap-2 mb-1.5">
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Default: campaigns</span>
          </div>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Sample marketing data. Upload your own CSV to query any dataset.
          </p>
        </div>
      )}
    </div>
  );
}
