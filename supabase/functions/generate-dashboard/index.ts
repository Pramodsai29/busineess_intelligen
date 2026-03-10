import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

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

    // Step 1: Generate SQL via Claude
    const sqlResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages,
      }),
    });

    if (!sqlResponse.ok) {
      const errText = await sqlResponse.text();
      console.error("Anthropic API error:", sqlResponse.status, errText);
      if (sqlResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`Anthropic API error: ${sqlResponse.status}`);
    }

    const sqlData = await sqlResponse.json();
    let sqlQuery = sqlData.content?.[0]?.text?.trim() || "";
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

    // Step 3: Determine chart type via Claude Haiku (fast + cheap)
    const CHART_SYSTEM_PROMPT = `You are a chart type selector. Given a SQL query and its results, determine the best chart type. Respond with ONLY one of: bar, line, pie, funnel, multi_bar. No explanation.

Rules:
- Time-series data (dates, months, years in results) → line
- Category comparisons (campaign types, channels, audiences, groups) → bar
- Parts of whole (percentages, proportions, single category with values) → pie
- Funnel metrics (impressions → clicks → leads → conversions in sequence) → funnel
- Multiple numeric metrics compared across categories → multi_bar`;

    const chartResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 10,
        system: CHART_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `SQL Query: ${sqlQuery}\n\nResult sample (first 3 rows): ${JSON.stringify(
              (queryResult || []).slice(0, 3)
            )}\n\nUser's original question: ${prompt}`,
          },
        ],
      }),
    });

    let chartType = "bar";
    if (chartResponse.ok) {
      const chartData = await chartResponse.json();
      const suggested = chartData.content?.[0]?.text?.trim().toLowerCase() || "";
      if (["bar", "line", "pie", "funnel", "multi_bar"].includes(suggested)) {
        chartType = suggested;
      }
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
