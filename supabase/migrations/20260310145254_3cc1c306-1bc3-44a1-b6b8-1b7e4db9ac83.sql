
-- Create campaigns table
CREATE TABLE public.campaigns (
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

-- Enable RLS
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

-- Allow public read access (BI dashboard data)
CREATE POLICY "Anyone can read campaigns" ON public.campaigns FOR SELECT USING (true);

-- Create a function that executes read-only SQL queries safely
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
  -- Normalize the query
  clean_query := TRIM(query_text);
  
  -- Only allow SELECT statements
  IF NOT (UPPER(clean_query) LIKE 'SELECT%') THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed';
  END IF;
  
  -- Block dangerous keywords
  IF UPPER(clean_query) ~ '(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|EXECUTE|COPY)' THEN
    RAISE EXCEPTION 'Query contains forbidden keywords';
  END IF;
  
  -- Execute and return as JSON
  EXECUTE 'SELECT json_agg(row_to_json(t)) FROM (' || clean_query || ') t' INTO result;
  
  RETURN COALESCE(result, '[]'::JSON);
END;
$$;
