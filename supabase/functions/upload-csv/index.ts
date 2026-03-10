import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].split(",").map((h) => h.trim().replace(/"/g, ""));
  const rows = lines.slice(1).map((line) => {
    const values: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  });
  return { headers, rows };
}

// Sanitize header to valid SQL column name
function sanitizeColumnName(header: string): string {
  return header
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/^[0-9]/, "col_$&") // can't start with number
    .substring(0, 63); // postgres column name limit
}

// Infer PostgreSQL type from a sample of values
function inferColumnType(values: string[]): string {
  const sample = values.filter((v) => v && v.trim() !== "").slice(0, 50);
  if (sample.length === 0) return "TEXT";

  const allInt = sample.every((v) => /^-?\d+$/.test(v.trim()));
  if (allInt) return "BIGINT";

  const allFloat = sample.every((v) => /^-?\d+(\.\d+)?$/.test(v.trim()));
  if (allFloat) return "FLOAT";

  const allDate = sample.every((v) =>
    /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ||
    /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(v.trim()) ||
    /^\d{4}\/\d{2}\/\d{2}$/.test(v.trim())
  );
  if (allDate) return "DATE";

  const allBool = sample.every((v) =>
    ["true", "false", "yes", "no", "1", "0", "t", "f"].includes(v.trim().toLowerCase())
  );
  if (allBool) return "BOOLEAN";

  return "TEXT";
}

function coerceValue(value: string, type: string): unknown {
  const v = value?.trim();
  if (!v) return null;
  if (type === "BIGINT") return parseInt(v, 10) || null;
  if (type === "FLOAT") return parseFloat(v) || null;
  if (type === "BOOLEAN") return ["true", "yes", "1", "t"].includes(v.toLowerCase());
  if (type === "DATE") {
    // Normalize date formats
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v)) {
      const [m, d, y] = v.split("/");
      return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    return v;
  }
  return v;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { csv_content, table_name, replace_data = false } = await req.json();

    if (!csv_content || typeof csv_content !== "string") {
      return new Response(
        JSON.stringify({ error: "Please provide CSV content." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { headers, rows } = parseCSV(csv_content);
    if (headers.length === 0 || rows.length === 0) {
      return new Response(
        JSON.stringify({ error: "CSV file is empty or invalid." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build sanitized column names
    const sanitizedHeaders = headers.map(sanitizeColumnName);

    // Deduplicate column names
    const seenCols = new Map<string, number>();
    const finalHeaders = sanitizedHeaders.map((h) => {
      const count = seenCols.get(h) ?? 0;
      seenCols.set(h, count + 1);
      return count === 0 ? h : `${h}_${count}`;
    });

    // Infer types from all rows
    const columnTypes: Record<string, string> = {};
    finalHeaders.forEach((col, i) => {
      const colValues = rows.map((row) => row[i] || "");
      columnTypes[col] = inferColumnType(colValues);
    });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Determine table name (sanitized)
    const targetTable = table_name
      ? sanitizeColumnName(table_name)
      : "uploaded_data";

    // Drop and recreate table, or create if not exists
    const columnDefs = finalHeaders
      .map((col) => `"${col}" ${columnTypes[col]}`)
      .join(", ");

    if (replace_data) {
      // Drop existing table if replacing
      const { error: dropErr } = await supabase.rpc("execute_admin_sql", {
        sql_text: `DROP TABLE IF EXISTS public."${targetTable}";`,
      });
      if (dropErr) {
        console.error("Drop error (non-fatal):", dropErr);
      }
    }

    // Create table if not exists
    const createSQL = `
      CREATE TABLE IF NOT EXISTS public."${targetTable}" (
        _id SERIAL PRIMARY KEY,
        ${columnDefs}
      );
      ALTER TABLE public."${targetTable}" ENABLE ROW LEVEL SECURITY;
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename = '${targetTable}' AND policyname = 'Anyone can read ${targetTable}'
        ) THEN
          CREATE POLICY "Anyone can read ${targetTable}" ON public."${targetTable}" FOR SELECT USING (true);
        END IF;
      END $$;
    `;

    const { error: createErr } = await supabase.rpc("execute_admin_sql", {
      sql_text: createSQL,
    });

    if (createErr) {
      console.error("Create table error:", createErr);
      return new Response(
        JSON.stringify({ error: `Failed to create table: ${createErr.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build insert data
    const insertData = rows
      .map((row) => {
        const obj: Record<string, unknown> = {};
        finalHeaders.forEach((col, i) => {
          const rawVal = row[i] || "";
          obj[col] = coerceValue(rawVal, columnTypes[col]);
        });
        return obj;
      })
      .filter((obj) => Object.values(obj).some((v) => v !== null));

    // Insert in batches
    const batchSize = 500;
    let inserted = 0;
    for (let i = 0; i < insertData.length; i += batchSize) {
      const batch = insertData.slice(i, i + batchSize);
      const { error: insertErr } = await supabase.from(targetTable).insert(batch);
      if (insertErr) {
        console.error("Insert error:", insertErr);
        return new Response(
          JSON.stringify({ error: `Failed to insert data: ${insertErr.message}`, rows_inserted: inserted }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      inserted += batch.length;
    }

    return new Response(
      JSON.stringify({
        success: true,
        rows_inserted: inserted,
        table_name: targetTable,
        columns: finalHeaders,
        column_types: columnTypes,
        schema: {
          [targetTable]: finalHeaders.map((col) => `${col} ${columnTypes[col]}`),
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("upload-csv error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
