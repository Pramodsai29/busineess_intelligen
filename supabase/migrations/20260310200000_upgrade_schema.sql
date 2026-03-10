-- ============================================================
-- UPGRADE: query-to-canvas — dynamic CSV + Claude API support
-- ============================================================

-- Keep the original campaigns table (for backwards compat)
CREATE TABLE IF NOT EXISTS public.campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id TEXT,
  campaign_type TEXT,
  target_audience TEXT,
  duration INTEGER,
  channel_used TEXT,
  impressions INTEGER,
  clicks INTEGER,
  leads INTEGER,
  conversions INTEGER,
  revenue FLOAT,
  acquisition_cost FLOAT,
  roi FLOAT,
  language TEXT,
  engagement_score FLOAT,
  customer_segment TEXT,
  date DATE
);

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'campaigns' AND policyname = 'Anyone can read campaigns'
  ) THEN
    CREATE POLICY "Anyone can read campaigns" ON public.campaigns FOR SELECT USING (true);
  END IF;
END $$;

-- Safe read-only query executor (used by generate-dashboard)
CREATE OR REPLACE FUNCTION public.execute_readonly_query(query_text TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
  clean_query TEXT;
BEGIN
  clean_query := TRIM(query_text);
  IF NOT (UPPER(clean_query) LIKE 'SELECT%') THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed';
  END IF;
  IF UPPER(clean_query) ~ '(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|EXECUTE|COPY)' THEN
    RAISE EXCEPTION 'Query contains forbidden keywords';
  END IF;
  EXECUTE 'SELECT json_agg(row_to_json(t)) FROM (' || clean_query || ') t' INTO result;
  RETURN COALESCE(result, '[]'::JSON);
END;
$$;

-- Admin SQL executor for dynamic table creation from CSV uploads
-- Only callable by service role (Edge Functions use service role key)
CREATE OR REPLACE FUNCTION public.execute_admin_sql(sql_text TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only allow CREATE TABLE, DROP TABLE, ALTER TABLE, CREATE POLICY, DO blocks
  IF NOT (
    UPPER(TRIM(sql_text)) LIKE 'CREATE TABLE%' OR
    UPPER(TRIM(sql_text)) LIKE 'DROP TABLE%' OR
    UPPER(TRIM(sql_text)) LIKE 'ALTER TABLE%' OR
    UPPER(TRIM(sql_text)) LIKE 'CREATE POLICY%' OR
    -- Allow DO blocks without embedding the DO body marker directly
    UPPER(TRIM(sql_text)) LIKE 'DO %' OR
    UPPER(TRIM(sql_text)) LIKE '%CREATE TABLE%' OR
    UPPER(TRIM(sql_text)) LIKE '%CREATE POLICY%'
  ) THEN
    RAISE EXCEPTION 'execute_admin_sql: disallowed SQL operation';
  END IF;
  EXECUTE sql_text;
END;
$$;

-- Only service role can call execute_admin_sql
REVOKE ALL ON FUNCTION public.execute_admin_sql(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.execute_admin_sql(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.execute_admin_sql(TEXT) FROM authenticated;
