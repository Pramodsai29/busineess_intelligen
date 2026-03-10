import { supabase } from "@/integrations/supabase/client";
import type { ChatMessage, DashboardResult, UploadedTable } from "@/types/dashboard";

export async function generateDashboard(
  prompt: string,
  conversationHistory: ChatMessage[],
  tableSchema?: Record<string, string[]>
): Promise<DashboardResult> {
  const { data, error } = await supabase.functions.invoke("generate-dashboard", {
    body: {
      prompt,
      conversation_history: conversationHistory.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      table_schema: tableSchema || null,
    },
  });

  if (error) {
    throw new Error(error.message || "Failed to generate dashboard");
  }

  return data as DashboardResult;
}

export async function uploadCSV(
  csvContent: string,
  tableName: string,
  replaceData: boolean = false
): Promise<UploadedTable & { error?: string }> {
  const { data, error } = await supabase.functions.invoke("upload-csv", {
    body: {
      csv_content: csvContent,
      table_name: tableName,
      replace_data: replaceData,
    },
  });

  if (error) {
    throw new Error(error.message || "Failed to upload CSV");
  }

  if (!data.success) {
    return { ...data } as UploadedTable & { error?: string };
  }

  return {
    tableName: data.table_name,
    columns: data.columns,
    columnTypes: data.column_types,
    rowsInserted: data.rows_inserted,
    schema: data.schema,
    uploadedAt: new Date(),
    fileName: tableName,
  };
}
