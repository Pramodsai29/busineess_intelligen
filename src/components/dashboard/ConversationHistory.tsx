import { User, Bot, Code } from "lucide-react";
import type { ChatMessage, DashboardResult } from "@/types/dashboard";

interface ConversationHistoryProps {
  messages: ChatMessage[];
  results: DashboardResult[];
}

export function ConversationHistory({ messages, results }: ConversationHistoryProps) {
  if (messages.length === 0) return null;

  return (
    <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
      {messages.map((msg, i) => {
        const resultIndex = Math.floor(i / 2);
        const result = msg.role === "assistant" ? results[resultIndex] : null;

        return (
          <div
            key={i}
            className={`flex gap-3 text-sm animate-slide-up ${
              msg.role === "user" ? "" : ""
            }`}
          >
            <div
              className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                msg.role === "user"
                  ? "bg-primary/10 text-primary"
                  : "bg-accent/10 text-accent"
              }`}
            >
              {msg.role === "user" ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-foreground">{msg.content}</p>
              {result?.sql && (
                <div className="mt-2 flex items-start gap-2 text-xs text-muted-foreground bg-surface-sunken rounded-lg p-2.5 font-mono overflow-x-auto">
                  <Code className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span className="break-all">{result.sql}</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
