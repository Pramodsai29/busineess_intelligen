import { useState } from "react";
import { BarChart3, Sparkles, Database } from "lucide-react";
import { QueryInput } from "@/components/dashboard/QueryInput";
import { DashboardChart } from "@/components/dashboard/DashboardChart";
import { CSVUpload } from "@/components/dashboard/CSVUpload";
import { ConversationHistory } from "@/components/dashboard/ConversationHistory";
import { generateDashboard } from "@/lib/api";
import { toast } from "sonner";
import type { ChatMessage, DashboardResult, UploadedTable } from "@/types/dashboard";

const Index = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<DashboardResult[]>([]);
  const [queries, setQueries] = useState<string[]>([]);
  const [conversation, setConversation] = useState<ChatMessage[]>([]);
  const [uploadedTables, setUploadedTables] = useState<UploadedTable[]>([]);
  const [activeTable, setActiveTable] = useState<UploadedTable | null>(null);

  const handleTableUploaded = (table: UploadedTable) => {
    setUploadedTables((prev) => {
      const existing = prev.findIndex((t) => t.tableName === table.tableName);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = table;
        return updated;
      }
      return [...prev, table];
    });
  };

  const handleQuery = async (query: string) => {
    setIsLoading(true);

    const updatedConversation: ChatMessage[] = [
      ...conversation,
      { role: "user", content: query },
    ];

    try {
      // Pass active table schema so Claude knows the columns
      const tableSchema = activeTable?.schema || undefined;
      const result = await generateDashboard(query, conversation, tableSchema);

      if (result.error) {
        toast.error(result.error);
        const assistantMsg: ChatMessage = { role: "assistant", content: result.error };
        setConversation([...updatedConversation, assistantMsg]);
      } else {
        const assistantMsg: ChatMessage = {
          role: "assistant",
          content: `Generated dashboard for: "${query}"`,
        };
        setConversation([...updatedConversation, assistantMsg]);
        setResults((prev) => [result, ...prev]);
        setQueries((prev) => [query, ...prev]);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Query to Canvas</h1>
              <p className="text-xs text-muted-foreground">Conversational Analytics · Powered by Claude</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {activeTable && (
              <div className="flex items-center gap-1.5 text-xs text-primary bg-primary/10 px-2.5 py-1 rounded-full">
                <Database className="h-3 w-3" />
                <span>{activeTable.tableName}</span>
                <span className="text-primary/60">· {activeTable.rowsInserted} rows</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Claude AI
            </div>
          </div>
        </div>
      </header>

      <main className="container max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Top section: Query + Upload */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-3 glass-card p-5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">
                Ask your data
                {activeTable && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    — querying <span className="text-primary">{activeTable.tableName}</span>
                  </span>
                )}
              </span>
            </div>
            <QueryInput
              onSubmit={handleQuery}
              isLoading={isLoading}
              activeTable={activeTable}
            />

            {conversation.length > 0 && (
              <div className="border-t border-border pt-4">
                <ConversationHistory messages={conversation} results={results} />
              </div>
            )}
          </div>

          <div className="lg:col-span-1">
            <CSVUpload
              onTableUploaded={handleTableUploaded}
              uploadedTables={uploadedTables}
              activeTable={activeTable}
              onSelectTable={setActiveTable}
            />
          </div>
        </div>

        {/* Charts */}
        {results.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-sm font-medium text-muted-foreground">
              Generated Dashboards ({results.length})
            </h2>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {results.map((result, i) => (
                <DashboardChart key={i} result={result} query={queries[i]} />
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {results.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <BarChart3 className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-lg font-medium mb-2">No dashboards yet</h2>
            <p className="text-sm text-muted-foreground max-w-md">
              Upload any CSV file and ask questions in plain English — Claude will generate the SQL and visualize the results automatically.
            </p>
          </div>
        )}

        {isLoading && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 animate-pulse-glow">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground">
              Claude is analyzing your query and generating SQL...
            </p>
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
