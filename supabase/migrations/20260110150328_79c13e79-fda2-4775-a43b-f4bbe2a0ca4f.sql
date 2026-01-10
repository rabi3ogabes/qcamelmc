-- Create page_views table for historical analytics
CREATE TABLE public.page_views (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  page_path TEXT NOT NULL,
  country TEXT,
  country_code TEXT,
  city TEXT,
  device_type TEXT,
  browser TEXT,
  os TEXT,
  traffic_source TEXT,
  is_new_visitor BOOLEAN DEFAULT true,
  viewed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ip_address TEXT
);

-- Create indexes for efficient querying
CREATE INDEX idx_page_views_page_path ON public.page_views(page_path);
CREATE INDEX idx_page_views_viewed_at ON public.page_views(viewed_at);
CREATE INDEX idx_page_views_country ON public.page_views(country);
CREATE INDEX idx_page_views_session_id ON public.page_views(session_id);

-- Enable Row Level Security
ALTER TABLE public.page_views ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Admins can view all page views" 
ON public.page_views 
FOR SELECT 
USING (EXISTS ( SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()));

CREATE POLICY "Anyone can insert page views" 
ON public.page_views 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Public can view page views for live visitors page" 
ON public.page_views 
FOR SELECT 
USING (true);

-- Create function to get page view stats
CREATE OR REPLACE FUNCTION get_page_view_stats(start_date TIMESTAMP WITH TIME ZONE, end_date TIMESTAMP WITH TIME ZONE)
RETURNS TABLE (
  page_path TEXT,
  view_count BIGINT,
  unique_visitors BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pv.page_path,
    COUNT(*)::BIGINT as view_count,
    COUNT(DISTINCT pv.session_id)::BIGINT as unique_visitors
  FROM public.page_views pv
  WHERE pv.viewed_at >= start_date AND pv.viewed_at <= end_date
  GROUP BY pv.page_path
  ORDER BY view_count DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create function to get visitors per date
CREATE OR REPLACE FUNCTION get_visitors_per_date(start_date TIMESTAMP WITH TIME ZONE, end_date TIMESTAMP WITH TIME ZONE)
RETURNS TABLE (
  visit_date DATE,
  total_visitors BIGINT,
  unique_visitors BIGINT,
  new_visitors BIGINT,
  returning_visitors BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    DATE(pv.viewed_at) as visit_date,
    COUNT(*)::BIGINT as total_visitors,
    COUNT(DISTINCT pv.session_id)::BIGINT as unique_visitors,
    COUNT(DISTINCT CASE WHEN pv.is_new_visitor = true THEN pv.session_id END)::BIGINT as new_visitors,
    COUNT(DISTINCT CASE WHEN pv.is_new_visitor = false THEN pv.session_id END)::BIGINT as returning_visitors
  FROM public.page_views pv
  WHERE pv.viewed_at >= start_date AND pv.viewed_at <= end_date
  GROUP BY DATE(pv.viewed_at)
  ORDER BY visit_date DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create function to get visitors per country
CREATE OR REPLACE FUNCTION get_visitors_per_country(start_date TIMESTAMP WITH TIME ZONE, end_date TIMESTAMP WITH TIME ZONE)
RETURNS TABLE (
  country TEXT,
  country_code TEXT,
  total_visitors BIGINT,
  unique_visitors BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(pv.country, 'Unknown') as country,
    COALESCE(pv.country_code, 'XX') as country_code,
    COUNT(*)::BIGINT as total_visitors,
    COUNT(DISTINCT pv.session_id)::BIGINT as unique_visitors
  FROM public.page_views pv
  WHERE pv.viewed_at >= start_date AND pv.viewed_at <= end_date
  GROUP BY pv.country, pv.country_code
  ORDER BY total_visitors DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;