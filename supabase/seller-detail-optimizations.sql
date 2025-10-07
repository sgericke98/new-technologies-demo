-- Seller Detail Page Optimizations
-- This file contains database optimizations for the seller detail page
-- Focuses on query performance while maintaining real-time data consistency

-- 1. Create indexes for relationship_maps queries
-- These are critical for the seller detail page performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_relationship_maps_seller_status 
ON relationship_maps(seller_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_relationship_maps_account_status 
ON relationship_maps(account_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_relationship_maps_status 
ON relationship_maps(status);

-- 2. Create indexes for account_revenues
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_account_revenues_account_id 
ON account_revenues(account_id);

-- 3. Create indexes for sellers
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sellers_manager_id 
ON sellers(manager_id);

-- 4. Create database views for complex joins (not materialized for real-time data)
-- This view combines seller account relationships with revenue data
CREATE OR REPLACE VIEW v_seller_accounts_with_revenue AS
SELECT 
  s.id as seller_id,
  s.name as seller_name,
  s.division as seller_division,
  s.size as seller_size,
  s.industry_specialty,
  s.lat as seller_lat,
  s.lng as seller_lng,
  rm.id as relationship_id,
  rm.status as relationship_status,
  rm.last_actor_user_id,
  rm.created_at as relationship_created_at,
  rm.updated_at as relationship_updated_at,
  a.id as account_id,
  a.name as account_name,
  a.city as account_city,
  a.state as account_state,
  a.country as account_country,
  a.industry as account_industry,
  a.size as account_size,
  a.tier as account_tier,
  a.type as account_type,
  a.current_division as account_current_division,
  a.lat as account_lat,
  a.lng as account_lng,
  ar.revenue_esg,
  ar.revenue_gdt,
  ar.revenue_gvc,
  ar.revenue_msg_us,
  COALESCE(ar.revenue_esg, 0) + 
  COALESCE(ar.revenue_gdt, 0) + 
  COALESCE(ar.revenue_gvc, 0) + 
  COALESCE(ar.revenue_msg_us, 0) as total_revenue
FROM sellers s
LEFT JOIN relationship_maps rm ON s.id = rm.seller_id
LEFT JOIN accounts a ON rm.account_id = a.id
LEFT JOIN account_revenues ar ON a.id = ar.account_id;

-- 5. Create view for original relationships with revenue
CREATE OR REPLACE VIEW v_original_relationships_with_revenue AS
SELECT 
  or_rel.seller_id,
  or_rel.account_id,
  or_rel.pct_esg,
  or_rel.pct_gdt,
  or_rel.pct_gvc,
  or_rel.pct_msg_us,
  a.id,
  a.name,
  a.city,
  a.state,
  a.country,
  a.industry,
  a.size,
  a.tier,
  a.type,
  a.current_division,
  a.lat,
  a.lng,
  ar.revenue_esg,
  ar.revenue_gdt,
  ar.revenue_gvc,
  ar.revenue_msg_us,
  COALESCE(ar.revenue_esg, 0) + 
  COALESCE(ar.revenue_gdt, 0) + 
  COALESCE(ar.revenue_gvc, 0) + 
  COALESCE(ar.revenue_msg_us, 0) as total_revenue
FROM original_relationships or_rel
JOIN accounts a ON or_rel.account_id = a.id
LEFT JOIN account_revenues ar ON a.id = ar.account_id;

-- 6. Create view for available accounts (not assigned to any seller)
CREATE OR REPLACE VIEW v_available_accounts AS
SELECT 
  a.id,
  a.name,
  a.city,
  a.state,
  a.country,
  a.industry,
  a.size,
  a.tier,
  a.type,
  a.current_division,
  a.lat,
  a.lng,
  ar.revenue_esg,
  ar.revenue_gdt,
  ar.revenue_gvc,
  ar.revenue_msg_us,
  COALESCE(ar.revenue_esg, 0) + 
  COALESCE(ar.revenue_gdt, 0) + 
  COALESCE(ar.revenue_gvc, 0) + 
  COALESCE(ar.revenue_msg_us, 0) as total_revenue
FROM accounts a
LEFT JOIN account_revenues ar ON a.id = ar.account_id
WHERE a.id NOT IN (
  SELECT DISTINCT account_id 
  FROM relationship_maps 
  WHERE status IN ('must_keep', 'for_discussion', 'to_be_peeled', 'pinned', 'assigned', 'up_for_debate', 'approval_for_pinning', 'approval_for_assigning', 'peeled')
);

-- 7. Create view for restricted accounts (assigned to other sellers)
CREATE OR REPLACE VIEW v_restricted_accounts AS
SELECT 
  a.id,
  a.name,
  a.city,
  a.state,
  a.country,
  a.industry,
  a.size,
  a.tier,
  a.type,
  a.current_division,
  a.lat,
  a.lng,
  ar.revenue_esg,
  ar.revenue_gdt,
  ar.revenue_gvc,
  ar.revenue_msg_us,
  COALESCE(ar.revenue_esg, 0) + 
  COALESCE(ar.revenue_gdt, 0) + 
  COALESCE(ar.revenue_gvc, 0) + 
  COALESCE(ar.revenue_msg_us, 0) as total_revenue,
  rm.seller_id as assigned_seller_id,
  s.name as assigned_seller_name
FROM accounts a
JOIN relationship_maps rm ON a.id = rm.account_id
JOIN sellers s ON rm.seller_id = s.id
LEFT JOIN account_revenues ar ON a.id = ar.account_id
WHERE rm.status IN ('must_keep', 'for_discussion', 'to_be_peeled', 'pinned', 'assigned', 'up_for_debate', 'approval_for_pinning', 'approval_for_assigning', 'peeled');

-- 8. Grant permissions for the views
GRANT SELECT ON v_seller_accounts_with_revenue TO authenticated;
GRANT SELECT ON v_original_relationships_with_revenue TO authenticated;
GRANT SELECT ON v_available_accounts TO authenticated;
GRANT SELECT ON v_restricted_accounts TO authenticated;

-- 9. Create function to calculate fit percentage (for available accounts)
CREATE OR REPLACE FUNCTION calculate_fit_percentage(
  account_lat DECIMAL,
  account_lng DECIMAL,
  account_industry TEXT,
  account_size TEXT,
  account_current_division TEXT,
  seller_lat DECIMAL,
  seller_lng DECIMAL,
  seller_industry_specialty TEXT,
  seller_size TEXT,
  seller_division TEXT
) RETURNS DECIMAL AS $$
DECLARE
  total_score DECIMAL := 0;
  max_possible_score DECIMAL := 0;
  distance_miles DECIMAL;
BEGIN
  -- 1. Division Overlap (40% weight)
  max_possible_score := max_possible_score + 40;
  IF account_current_division = seller_division THEN
    total_score := total_score + 40;
  END IF;

  -- 2. Geographic Proximity (25% weight) - For Midmarket sellers
  max_possible_score := max_possible_score + 25;
  IF seller_size = 'midmarket' AND seller_lat IS NOT NULL AND seller_lng IS NOT NULL 
     AND account_lat IS NOT NULL AND account_lng IS NOT NULL THEN
    -- Calculate distance using Haversine formula
    distance_miles := 3959 * acos(
      cos(radians(seller_lat)) * cos(radians(account_lat)) * 
      cos(radians(account_lng) - radians(seller_lng)) + 
      sin(radians(seller_lat)) * sin(radians(account_lat))
    );
    
    IF distance_miles <= 50 THEN
      total_score := total_score + 25;
    ELSIF distance_miles <= 100 THEN
      total_score := total_score + 15;
    ELSIF distance_miles <= 200 THEN
      total_score := total_score + 10;
    END IF;
  ELSE
    total_score := total_score + 25; -- Full score for enterprise or no location data
  END IF;

  -- 3. Industry Specialty Match (20% weight)
  max_possible_score := max_possible_score + 20;
  IF seller_industry_specialty IS NOT NULL AND seller_industry_specialty != '-' 
     AND account_industry IS NOT NULL AND account_industry = seller_industry_specialty THEN
    total_score := total_score + 20;
  ELSE
    total_score := total_score + 10; -- Partial score for no match
  END IF;

  -- 4. Account Size Alignment (15% weight)
  max_possible_score := max_possible_score + 15;
  IF account_size = seller_size THEN
    total_score := total_score + 15;
  ELSE
    total_score := total_score + 5; -- Partial score for mismatch
  END IF;

  -- Return percentage
  IF max_possible_score > 0 THEN
    RETURN ROUND((total_score / max_possible_score) * 100, 1);
  ELSE
    RETURN 0;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 10. Create optimized view for available accounts with fit percentage
CREATE OR REPLACE VIEW v_available_accounts_with_fit AS
SELECT 
  va.*,
  calculate_fit_percentage(
    va.lat,
    va.lng,
    va.industry,
    va.size,
    va.current_division,
    s.lat,
    s.lng,
    s.industry_specialty,
    s.size,
    s.division
  ) as fit_percentage
FROM v_available_accounts va
CROSS JOIN sellers s
WHERE s.id = $1; -- This will be parameterized in the query

-- 11. Create function to get available accounts with fit percentage
CREATE OR REPLACE FUNCTION get_available_accounts_with_fit(seller_id_param UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  industry TEXT,
  size size_type,
  tier TEXT,
  type TEXT,
  current_division division_type,
  lat NUMERIC,
  lng NUMERIC,
  revenue_esg NUMERIC,
  revenue_gdt NUMERIC,
  revenue_gvc NUMERIC,
  revenue_msg_us NUMERIC,
  total_revenue NUMERIC,
  fit_percentage NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
      va.id,
      va.name,
      va.city,
      va.state,
      va.country,
      va.industry,
      va.size,
      va.tier,
      va.type,
      va.current_division,
      va.lat,
      va.lng,
      va.revenue_esg,
      va.revenue_gdt,
      va.revenue_gvc,
      va.revenue_msg_us,
      va.total_revenue,
      calculate_fit_percentage(
        va.lat,
        va.lng,
        va.industry,
        va.size::TEXT,
        va.current_division::TEXT,
        s.lat,
        s.lng,
        s.industry_specialty,
        s.size::TEXT,
        s.division::TEXT
      ) as fit_percentage
  FROM v_available_accounts va
  CROSS JOIN sellers s
  WHERE s.id = seller_id_param;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT SELECT ON v_available_accounts_with_fit TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_fit_percentage TO authenticated;
GRANT EXECUTE ON FUNCTION get_available_accounts_with_fit TO authenticated;
