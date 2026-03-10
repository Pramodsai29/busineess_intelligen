import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Always use a small local model server (e.g. Ollama) reachable from this function.
// When running in Supabase's Docker network, use host.docker.internal to reach your Mac host.
const LOCAL_MODEL_URL =
  Deno.env.get("LOCAL_MODEL_URL") ?? "http://host.docker.internal:11434/api/chat";
const LOCAL_MODEL_NAME = Deno.env.get("LOCAL_MODEL_NAME") ?? "llama3.2:3b";

async function generateWithModel(params: {
  systemPrompt: string;
  messages: { role: "user" | "assistant"; content: string }[];
  maxTokens: number;
}): Promise<string> {
  const { systemPrompt, messages, maxTokens } = params;

  // Expect a local model server roughly following the Ollama /api/chat schema.
  console.log("generateWithModel using local model", {
    url: LOCAL_MODEL_URL,
    model: LOCAL_MODEL_NAME,
  });

  const response = await fetch(LOCAL_MODEL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: LOCAL_MODEL_NAME,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      stream: false,
      options: {
        num_predict: maxTokens,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("Local model API error:", response.status, errText);
    throw new Error(`Local model API error: ${response.status}`);
  }

  const data = await response.json();
  const text =
    data.message?.content?.[0]?.text ??
    data.message?.content ??
    data.choices?.[0]?.message?.content ??
    "";

  return (typeof text === "string" ? text : "").trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, conversation_history = [], table_schema } = await req.json();

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Please provide a valid query." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Use dynamic schema from client, or fall back to default campaigns schema
    let schemaDescription = "";
    if (table_schema && typeof table_schema === "object") {
      schemaDescription = Object.entries(table_schema as Record<string, string[]>)
        .map(([table, columns]) => `Table: ${table}\nColumns: ${columns.join(", ")}`)
        .join("\n\n");
    } else {
      schemaDescription = `Table: campaigns
Columns: campaign_id TEXT, campaign_type TEXT, target_audience TEXT, duration INTEGER, channel_used TEXT, impressions INTEGER, clicks INTEGER, leads INTEGER, conversions INTEGER, revenue FLOAT, acquisition_cost FLOAT, roi FLOAT, language TEXT, engagement_score FLOAT, customer_segment TEXT, date DATE`;
    }

    const SYSTEM_PROMPT = `You are a SQL query generator for a PostgreSQL analytics database. You ONLY output valid PostgreSQL SELECT queries. No explanations, no markdown, no code fences — just the raw SQL query.

Database schema:
${schemaDescription}

Rules:
- ONLY generate SELECT queries
- Use the exact column names provided
- For date grouping use DATE_TRUNC or EXTRACT
- Always alias aggregated columns clearly (e.g. total_revenue, avg_roi)
- If the user query cannot be answered with the available columns, respond with exactly: UNABLE_TO_ANSWER
- Never hallucinate column names or data
- For "monthly" queries, group by month extracted from the date column
- For funnel queries, use SUM on impressions, clicks, leads, conversions
- Cast numeric text columns to FLOAT or INT as needed using ::FLOAT or ::INT`;

    const messages = [
      ...conversation_history.map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user" as const, content: prompt },
    ];

    // Step 1: Generate SQL via model provider (Claude or local model)
    let sqlQuery = await generateWithModel({
      systemPrompt: SYSTEM_PROMPT,
      messages,
      maxTokens: 1024,
    });
    sqlQuery = sqlQuery.replace(/```sql\n?/gi, "").replace(/```\n?/g, "").trim().replace(/;\s*$/, "");

    if (sqlQuery === "UNABLE_TO_ANSWER" || !sqlQuery) {
      return new Response(
        JSON.stringify({
          error: "Unable to answer this query with the available dataset.",
          sql: null,
          data: null,
          chart_type: null,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!sqlQuery.toUpperCase().trimStart().startsWith("SELECT")) {
      return new Response(
        JSON.stringify({ error: "Unable to answer this query with the available dataset." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 2: Execute SQL
    const { data: queryResult, error: queryError } = await supabase.rpc(
      "execute_readonly_query",
      { query_text: sqlQuery }
    );

    if (queryError) {
      console.error("SQL execution error:", queryError);
      return new Response(
        JSON.stringify({
          error: `SQL error: ${queryError.message}`,
          sql: sqlQuery,
          data: null,
          chart_type: null,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 3: Determine chart type via model provider
    const CHART_SYSTEM_PROMPT = `You are a chart type selector. Given a SQL query and its results, determine the best chart type. Respond with ONLY one of: bar, line, pie, funnel, multi_bar. No explanation.

Rules:
- Time-series data (dates, months, years in results) → line
- Category comparisons (campaign types, channels, audiences, groups) → bar
- Parts of whole (percentages, proportions, single category with values) → pie
- Funnel metrics (impressions → clicks → leads → conversions in sequence) → funnel
- Multiple numeric metrics compared across categories → multi_bar`;

    let chartType = "bar";
    try {
      const chartSuggestion = await generateWithModel({
        systemPrompt: CHART_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `SQL Query: ${sqlQuery}\n\nResult sample (first 3 rows): ${JSON.stringify(
              (queryResult || []).slice(0, 3)
            )}\n\nUser's original question: ${prompt}`,
          },
        ],
        maxTokens: 10,
      });
      const suggested = chartSuggestion.trim().toLowerCase();
      if (["bar", "line", "pie", "funnel", "multi_bar"].includes(suggested)) {
        chartType = suggested;
      }
    } catch (e) {
      console.error("Chart type model error:", e);
    }

    return new Response(
      JSON.stringify({
        sql: sqlQuery,
        data: queryResult || [],
        chart_type: chartType,
        error: null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("generate-dashboard error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
