-- Unified Dashboard Materialized View
-- This single view replaces all 6 separate queries with one comprehensive data source
-- Provides complete dashboard data with all relationships, revenue, and performance metrics

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_unified_dashboard AS
WITH seller_performance AS (
  SELECT 
    s.id as seller_id,
    s.name as seller_name,
    s.division,
    s.size,
    s.tenure_months,
    s.industry_specialty,
    s.book_finalized,
    s.manager_id,
    m.name as manager_name,
    m.user_id as manager_user_id,
    
    -- Account relationships and revenue
    COUNT(DISTINCT rm.id) as account_count,
    COUNT(DISTINCT rm.account_id) as unique_account_count,
    COALESCE(SUM(
      COALESCE(ar.revenue_esg, 0) + 
      COALESCE(ar.revenue_gdt, 0) + 
      COALESCE(ar.revenue_gvc, 0) + 
      COALESCE(ar.revenue_msg_us, 0)
    ), 0) as total_revenue,
    
    -- Health indicators
    CASE 
      WHEN s.size = 'enterprise' AND s.tenure_months > 12 THEN
        COALESCE(SUM(
          COALESCE(ar.revenue_esg, 0) + 
          COALESCE(ar.revenue_gdt, 0) + 
          COALESCE(ar.revenue_gvc, 0) + 
          COALESCE(ar.revenue_msg_us, 0)
        ), 0) BETWEEN 5000000 AND 20000000
      WHEN s.size = 'enterprise' AND s.tenure_months <= 12 THEN
        COALESCE(SUM(
          COALESCE(ar.revenue_esg, 0) + 
          COALESCE(ar.revenue_gdt, 0) + 
          COALESCE(ar.revenue_gvc, 0) + 
          COALESCE(ar.revenue_msg_us, 0)
        ), 0) BETWEEN 3000000 AND 10000000
      WHEN s.size = 'midmarket' AND s.tenure_months > 12 THEN
        COALESCE(SUM(
          COALESCE(ar.revenue_esg, 0) + 
          COALESCE(ar.revenue_gdt, 0) + 
          COALESCE(ar.revenue_gvc, 0) + 
          COALESCE(ar.revenue_msg_us, 0)
        ), 0) BETWEEN 2000000 AND 8000000
      WHEN s.size = 'midmarket' AND s.tenure_months <= 12 THEN
        COALESCE(SUM(
          COALESCE(ar.revenue_esg, 0) + 
          COALESCE(ar.revenue_gdt, 0) + 
          COALESCE(ar.revenue_gvc, 0) + 
          COALESCE(ar.revenue_msg_us, 0)
        ), 0) BETWEEN 1000000 AND 5000000
      ELSE false
    END as is_revenue_healthy,
    
    -- Account count health
    CASE 
      WHEN s.size = 'enterprise' AND s.tenure_months > 12 THEN
        COUNT(DISTINCT rm.id) <= 7
      WHEN s.size = 'enterprise' AND s.tenure_months <= 12 THEN
        COUNT(DISTINCT rm.id) <= 4
      WHEN s.size = 'midmarket' AND s.tenure_months > 12 THEN
        COUNT(DISTINCT rm.id) <= 5
      WHEN s.size = 'midmarket' AND s.tenure_months <= 12 THEN
        COUNT(DISTINCT rm.id) <= 3
      ELSE true
    END as is_account_healthy,
    
    -- Size mismatch detection
    CASE 
      WHEN s.size = 'enterprise' AND EXISTS (
        SELECT 1 FROM relationship_maps rm2 
        JOIN accounts a2 ON rm2.account_id = a2.id 
        WHERE rm2.seller_id = s.id AND rm2.status = 'must_keep' AND a2.size = 'midmarket'
      ) THEN 'enterprise_with_midmarket'
      WHEN s.size = 'midmarket' AND EXISTS (
        SELECT 1 FROM relationship_maps rm2 
        JOIN accounts a2 ON rm2.account_id = a2.id 
        WHERE rm2.seller_id = s.id AND rm2.status = 'must_keep' AND a2.size = 'enterprise'
      ) THEN 'midmarket_with_enterprise'
      ELSE 'no_mismatch'
    END as size_mismatch_type,
    
    -- Industry mismatch detection
    CASE 
      WHEN s.industry_specialty IS NOT NULL AND s.industry_specialty != '-' AND EXISTS (
        SELECT 1 FROM relationship_maps rm3 
        JOIN accounts a3 ON rm3.account_id = a3.id 
        WHERE rm3.seller_id = s.id AND rm3.status = 'must_keep' 
        AND a3.industry IS NOT NULL AND a3.industry != s.industry_specialty
      ) THEN true
      ELSE false
    END as has_industry_mismatch,
    
    -- Account details for relationships
    JSON_AGG(
      CASE WHEN rm.id IS NOT NULL THEN
        JSON_BUILD_OBJECT(
          'relationship_id', rm.id,
          'account_id', a.id,
          'account_name', a.name,
          'account_size', a.size,
          'account_industry', a.industry,
          'account_city', a.city,
          'account_state', a.state,
          'account_country', a.country,
          'account_tier', a.tier,
          'account_type', a.type,
          'account_current_division', a.current_division,
          'account_lat', a.lat,
          'account_lng', a.lng,
          'relationship_status', rm.status,
          'revenue_esg', ar.revenue_esg,
          'revenue_gdt', ar.revenue_gdt,
          'revenue_gvc', ar.revenue_gvc,
          'revenue_msg_us', ar.revenue_msg_us,
          'total_account_revenue', 
            COALESCE(ar.revenue_esg, 0) + 
            COALESCE(ar.revenue_gdt, 0) + 
            COALESCE(ar.revenue_gvc, 0) + 
            COALESCE(ar.revenue_msg_us, 0)
        )
      END
    ) FILTER (WHERE rm.id IS NOT NULL) as relationships,
    
    -- Manager performance metrics
    COUNT(DISTINCT CASE WHEN s2.manager_id = s.manager_id THEN s2.id END) as manager_seller_count,
    COUNT(DISTINCT CASE WHEN s2.manager_id = s.manager_id THEN rm2.account_id END) as manager_total_accounts,
    COALESCE(SUM(
      CASE WHEN s2.manager_id = s.manager_id THEN
        COALESCE(ar2.revenue_esg, 0) + 
        COALESCE(ar2.revenue_gdt, 0) + 
        COALESCE(ar2.revenue_gvc, 0) + 
        COALESCE(ar2.revenue_msg_us, 0)
      ELSE 0 END
    ), 0) as manager_total_revenue,
    
    -- Division breakdown for manager
    COUNT(DISTINCT CASE WHEN s2.manager_id = s.manager_id AND s2.division = 'ESG' THEN s2.id END) as manager_esg_sellers,
    COUNT(DISTINCT CASE WHEN s2.manager_id = s.manager_id AND s2.division = 'GDT' THEN s2.id END) as manager_gdt_sellers,
    COUNT(DISTINCT CASE WHEN s2.manager_id = s.manager_id AND s2.division = 'GVC' THEN s2.id END) as manager_gvc_sellers,
    COUNT(DISTINCT CASE WHEN s2.manager_id = s.manager_id AND s2.division = 'MSG_US' THEN s2.id END) as manager_msg_sellers,
    COUNT(DISTINCT CASE WHEN s2.manager_id = s.manager_id AND s2.division = 'MIXED' THEN s2.id END) as manager_mixed_sellers,
    
    -- Enterprise vs Midmarket breakdown for manager
    COUNT(DISTINCT CASE WHEN s2.manager_id = s.manager_id AND s2.size = 'enterprise' THEN s2.id END) as manager_enterprise_sellers,
    COUNT(DISTINCT CASE WHEN s2.manager_id = s.manager_id AND s2.size = 'midmarket' THEN s2.id END) as manager_midmarket_sellers,
    
    -- Enterprise revenue for manager
    COALESCE(SUM(
      CASE WHEN s2.manager_id = s.manager_id AND s2.size = 'enterprise' THEN
        COALESCE(ar2.revenue_esg, 0) + 
        COALESCE(ar2.revenue_gdt, 0) + 
        COALESCE(ar2.revenue_gvc, 0) + 
        COALESCE(ar2.revenue_msg_us, 0)
      ELSE 0 END
    ), 0) as manager_enterprise_revenue,
    
    -- Midmarket revenue for manager
    COALESCE(SUM(
      CASE WHEN s2.manager_id = s.manager_id AND s2.size = 'midmarket' THEN
        COALESCE(ar2.revenue_esg, 0) + 
        COALESCE(ar2.revenue_gdt, 0) + 
        COALESCE(ar2.revenue_gvc, 0) + 
        COALESCE(ar2.revenue_msg_us, 0)
      ELSE 0 END
    ), 0) as manager_midmarket_revenue
    
  FROM sellers s
  LEFT JOIN managers m ON s.manager_id = m.id
  LEFT JOIN relationship_maps rm ON s.id = rm.seller_id AND rm.status = 'must_keep'
  LEFT JOIN accounts a ON rm.account_id = a.id
  LEFT JOIN account_revenues ar ON a.id = ar.account_id
  -- Join for manager calculations
  LEFT JOIN sellers s2 ON s.manager_id = s2.manager_id
  LEFT JOIN relationship_maps rm2 ON s2.id = rm2.seller_id AND rm2.status = 'must_keep'
  LEFT JOIN accounts a2 ON rm2.account_id = a2.id
  LEFT JOIN account_revenues ar2 ON a2.id = ar2.account_id
  GROUP BY s.id, s.name, s.division, s.size, s.tenure_months, s.industry_specialty, s.book_finalized, s.manager_id, m.name, m.user_id
),
account_summary AS (
  SELECT 
    a.id as account_id,
    a.name as account_name,
    a.size as account_size,
    a.industry as account_industry,
    a.city as account_city,
    a.state as account_state,
    a.country as account_country,
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
    COALESCE(ar.revenue_msg_us, 0) as total_revenue,
    COUNT(DISTINCT rm.seller_id) as assigned_seller_count,
    JSON_AGG(
      CASE WHEN rm.seller_id IS NOT NULL THEN
        JSON_BUILD_OBJECT(
          'seller_id', s.id,
          'seller_name', s.name,
          'seller_division', s.division,
          'seller_size', s.size,
          'relationship_status', rm.status
        )
      END
    ) FILTER (WHERE rm.seller_id IS NOT NULL) as assigned_sellers
  FROM accounts a
  LEFT JOIN account_revenues ar ON a.id = ar.account_id
  LEFT JOIN relationship_maps rm ON a.id = rm.account_id AND rm.status = 'must_keep'
  LEFT JOIN sellers s ON rm.seller_id = s.id
  GROUP BY a.id, a.name, a.size, a.industry, a.city, a.state, a.country, a.tier, a.type, a.current_division, a.lat, a.lng, ar.revenue_esg, ar.revenue_gdt, ar.revenue_gvc, ar.revenue_msg_us
),
kpi_summary AS (
  SELECT 
    'enterprise' as size_type,
    COUNT(DISTINCT sp.seller_id) as seller_count,
    COUNT(DISTINCT sp.unique_account_count) as total_accounts,
    SUM(sp.total_revenue) as total_revenue,
    CASE 
      WHEN COUNT(DISTINCT sp.unique_account_count) > 0 
      THEN SUM(sp.total_revenue) / COUNT(DISTINCT sp.unique_account_count)
      ELSE 0 
    END as avg_revenue_per_account
  FROM seller_performance sp
  WHERE sp.size = 'enterprise'
  
  UNION ALL
  
  SELECT 
    'midmarket' as size_type,
    COUNT(DISTINCT sp.seller_id) as seller_count,
    COUNT(DISTINCT sp.unique_account_count) as total_accounts,
    SUM(sp.total_revenue) as total_revenue,
    CASE 
      WHEN COUNT(DISTINCT sp.unique_account_count) > 0 
      THEN SUM(sp.total_revenue) / COUNT(DISTINCT sp.unique_account_count)
      ELSE 0 
    END as avg_revenue_per_account
  FROM seller_performance sp
  WHERE sp.size = 'midmarket'
)
SELECT 
  -- Seller data
  sp.*,
  
  -- Account summary data
  JSON_AGG(
    CASE WHEN ac.account_id IS NOT NULL THEN
      JSON_BUILD_OBJECT(
        'account_id', ac.account_id,
        'account_name', ac.account_name,
        'account_size', ac.account_size,
        'account_industry', ac.account_industry,
        'account_city', ac.account_city,
        'account_state', ac.account_state,
        'account_country', ac.account_country,
        'account_tier', ac.account_tier,
        'account_type', ac.account_type,
        'account_current_division', ac.account_current_division,
        'account_lat', ac.account_lat,
        'account_lng', ac.account_lng,
        'revenue_esg', ac.revenue_esg,
        'revenue_gdt', ac.revenue_gdt,
        'revenue_gvc', ac.revenue_gvc,
        'revenue_msg_us', ac.revenue_msg_us,
        'total_revenue', ac.total_revenue,
        'assigned_seller_count', ac.assigned_seller_count,
        'assigned_sellers', ac.assigned_sellers
      )
    END
  ) FILTER (WHERE ac.account_id IS NOT NULL) as all_accounts,
  
  -- KPI data
  JSON_AGG(
    CASE WHEN kpi.size_type IS NOT NULL THEN
      JSON_BUILD_OBJECT(
        'size_type', kpi.size_type,
        'seller_count', kpi.seller_count,
        'total_accounts', kpi.total_accounts,
        'total_revenue', kpi.total_revenue,
        'avg_revenue_per_account', kpi.avg_revenue_per_account
      )
    END
  ) FILTER (WHERE kpi.size_type IS NOT NULL) as kpi_data,
  
  -- Global summary
  COUNT(DISTINCT sp.seller_id) as total_sellers,
  COUNT(DISTINCT ac.account_id) as total_accounts,
  SUM(sp.total_revenue) as global_total_revenue,
  COUNT(DISTINCT sp.manager_id) as total_managers

FROM seller_performance sp
CROSS JOIN account_summary ac
CROSS JOIN kpi_summary kpi
GROUP BY sp.seller_id, sp.seller_name, sp.division, sp.size, sp.tenure_months, sp.industry_specialty, sp.book_finalized, sp.manager_id, sp.manager_name, sp.manager_user_id, sp.account_count, sp.unique_account_count, sp.total_revenue, sp.is_revenue_healthy, sp.is_account_healthy, sp.size_mismatch_type, sp.has_industry_mismatch, sp.relationships, sp.manager_seller_count, sp.manager_total_accounts, sp.manager_total_revenue, sp.manager_esg_sellers, sp.manager_gdt_sellers, sp.manager_gvc_sellers, sp.manager_msg_sellers, sp.manager_mixed_sellers, sp.manager_enterprise_sellers, sp.manager_midmarket_sellers, sp.manager_enterprise_revenue, sp.manager_midmarket_revenue;

-- Create indexes for performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mv_unified_dashboard_seller_id ON mv_unified_dashboard(seller_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mv_unified_dashboard_manager_id ON mv_unified_dashboard(manager_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mv_unified_dashboard_division ON mv_unified_dashboard(division);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mv_unified_dashboard_size ON mv_unified_dashboard(size);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mv_unified_dashboard_manager_user_id ON mv_unified_dashboard(manager_user_id);

-- Grant permissions
GRANT SELECT ON mv_unified_dashboard TO authenticated;
