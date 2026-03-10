export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface DashboardResult {
  sql: string | null;
  data: Record<string, unknown>[] | null;
  chart_type: "bar" | "line" | "pie" | "funnel" | "multi_bar" | null;
  error: string | null;
}

export interface QueryState {
  isLoading: boolean;
  results: DashboardResult[];
  conversation: ChatMessage[];
}

export interface UploadedTable {
  tableName: string;
  columns: string[];
  columnTypes: Record<string, string>;
  rowsInserted: number;
  schema: Record<string, string[]>;
  uploadedAt: Date;
  fileName: string;
}
