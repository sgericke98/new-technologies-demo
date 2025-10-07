-- Database Performance Optimizations for BAIN Platform
-- This script creates indexes, materialized views, and optimizations
-- to dramatically improve query performance while maintaining full data access

-- ==============================================
-- 1. CRITICAL INDEXES FOR PERFORMANCE
-- ==============================================

-- Indexes for sellers table
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sellers_manager_id ON sellers(manager_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sellers_division ON sellers(division);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sellers_size ON sellers(size);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sellers_tenure ON sellers(tenure_months);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sellers_finalized ON sellers(book_finalized);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sellers_industry ON sellers(industry_specialty);

-- Indexes for accounts table
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_accounts_name ON accounts(name);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_accounts_size ON accounts(size);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_accounts_industry ON accounts(industry);

-- Indexes for relationship_maps table
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_relationship_maps_seller_id ON relationship_maps(seller_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_relationship_maps_account_id ON relationship_maps(account_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_relationship_maps_status ON relationship_maps(status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_relationship_maps_seller_status ON relationship_maps(seller_id, status);

-- Indexes for managers table
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_managers_user_id ON managers(user_id);

-- Indexes for account_revenues table
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_account_revenues_account_id ON account_revenues(account_id);

-- Indexes for audit_logs table
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_entity_action ON audit_logs(entity, action);

-- ==============================================
-- 2. MATERIALIZED VIEWS FOR COMPLEX QUERIES
-- ==============================================

-- Materialized view for seller performance metrics
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_seller_performance AS
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
    COUNT(rm.id) as account_count,
    COALESCE(SUM(
        COALESCE(ar.revenue_esg, 0) + 
        COALESCE(ar.revenue_gdt, 0) + 
        COALESCE(ar.revenue_gvc, 0) + 
        COALESCE(ar.revenue_msg_us, 0)
    ), 0) as total_revenue,
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
    END as has_industry_mismatch
FROM sellers s
LEFT JOIN managers m ON s.manager_id = m.id
LEFT JOIN relationship_maps rm ON s.id = rm.seller_id AND rm.status = 'must_keep'
LEFT JOIN accounts a ON rm.account_id = a.id
LEFT JOIN account_revenues ar ON a.id = ar.account_id
GROUP BY s.id, s.name, s.division, s.size, s.tenure_months, s.industry_specialty, s.book_finalized, s.manager_id, m.name;

-- Create index on materialized view
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mv_seller_performance_seller_id ON mv_seller_performance(seller_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mv_seller_performance_division ON mv_seller_performance(division);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mv_seller_performance_size ON mv_seller_performance(size);

-- Materialized view for manager performance
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_manager_performance AS
SELECT 
    m.id as manager_id,
    m.name as manager_name,
    m.user_id,
    COUNT(DISTINCT s.id) as seller_count,
    COUNT(DISTINCT rm.account_id) as total_accounts,
    COALESCE(SUM(
        COALESCE(ar.revenue_esg, 0) + 
        COALESCE(ar.revenue_gdt, 0) + 
        COALESCE(ar.revenue_gvc, 0) + 
        COALESCE(ar.revenue_msg_us, 0)
    ), 0) as total_revenue,
    COUNT(DISTINCT CASE WHEN s.size = 'enterprise' THEN s.id END) as enterprise_sellers,
    COUNT(DISTINCT CASE WHEN s.size = 'midmarket' THEN s.id END) as midmarket_sellers,
    -- Division breakdown
    COUNT(DISTINCT CASE WHEN s.division = 'ESG' THEN s.id END) as esg_sellers,
    COUNT(DISTINCT CASE WHEN s.division = 'GDT' THEN s.id END) as gdt_sellers,
    COUNT(DISTINCT CASE WHEN s.division = 'GVC' THEN s.id END) as gvc_sellers,
    COUNT(DISTINCT CASE WHEN s.division = 'MSG_US' THEN s.id END) as msg_sellers,
    COUNT(DISTINCT CASE WHEN s.division = 'MIXED' THEN s.id END) as mixed_sellers
FROM managers m
LEFT JOIN sellers s ON m.id = s.manager_id
LEFT JOIN relationship_maps rm ON s.id = rm.seller_id AND rm.status = 'must_keep'
LEFT JOIN accounts a ON rm.account_id = a.id
LEFT JOIN account_revenues ar ON a.id = ar.account_id
GROUP BY m.id, m.name, m.user_id;

-- Create index on materialized view
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mv_manager_performance_manager_id ON mv_manager_performance(manager_id);

-- Materialized view for audit statistics
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_audit_stats AS
SELECT 
    COUNT(*) as total_logs,
    COUNT(DISTINCT user_id) as unique_users,
    COUNT(DISTINCT entity) as unique_entities,
    COUNT(DISTINCT action) as unique_actions,
    -- Action breakdown
    COUNT(CASE WHEN action = 'create' THEN 1 END) as create_count,
    COUNT(CASE WHEN action = 'update' THEN 1 END) as update_count,
    COUNT(CASE WHEN action = 'delete' THEN 1 END) as delete_count,
    COUNT(CASE WHEN action = 'login' THEN 1 END) as login_count,
    COUNT(CASE WHEN action = 'logout' THEN 1 END) as logout_count,
    -- Entity breakdown
    COUNT(CASE WHEN entity = 'seller' THEN 1 END) as seller_actions,
    COUNT(CASE WHEN entity = 'account' THEN 1 END) as account_actions,
    COUNT(CASE WHEN entity = 'relationship' THEN 1 END) as relationship_actions,
    -- Recent activity (last 24 hours)
    COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as recent_activity
FROM audit_logs;

-- ==============================================
-- 3. OPTIMIZED FUNCTIONS FOR COMPLEX QUERIES
-- ==============================================

-- Function to refresh materialized views
CREATE OR REPLACE FUNCTION refresh_performance_views()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_seller_performance;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_manager_performance;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_audit_stats;
END;
$$ LANGUAGE plpgsql;

-- Function to get seller performance with health indicators
CREATE OR REPLACE FUNCTION get_seller_performance_with_health(
    p_manager_id UUID DEFAULT NULL,
    p_division TEXT DEFAULT NULL,
    p_size TEXT DEFAULT NULL
)
RETURNS TABLE (
    seller_id UUID,
    seller_name TEXT,
    division TEXT,
    size TEXT,
    tenure_months INTEGER,
    industry_specialty TEXT,
    book_finalized BOOLEAN,
    manager_name TEXT,
    account_count BIGINT,
    total_revenue NUMERIC,
    is_revenue_healthy BOOLEAN,
    is_account_healthy BOOLEAN,
    size_mismatch_type TEXT,
    has_industry_mismatch BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        sp.seller_id,
        sp.seller_name,
        sp.division,
        sp.size,
        sp.tenure_months,
        sp.industry_specialty,
        sp.book_finalized,
        sp.manager_name,
        sp.account_count,
        sp.total_revenue,
        -- Revenue health based on size and seniority
        CASE 
            WHEN sp.size = 'enterprise' AND sp.tenure_months > 12 THEN
                sp.total_revenue BETWEEN 5000000 AND 20000000
            WHEN sp.size = 'enterprise' AND sp.tenure_months <= 12 THEN
                sp.total_revenue BETWEEN 3000000 AND 10000000
            WHEN sp.size = 'midmarket' AND sp.tenure_months > 12 THEN
                sp.total_revenue BETWEEN 2000000 AND 8000000
            WHEN sp.size = 'midmarket' AND sp.tenure_months <= 12 THEN
                sp.total_revenue BETWEEN 1000000 AND 5000000
            ELSE false
        END as is_revenue_healthy,
        -- Account health based on size and seniority
        CASE 
            WHEN sp.size = 'enterprise' AND sp.tenure_months > 12 THEN
                sp.account_count <= 7
            WHEN sp.size = 'enterprise' AND sp.tenure_months <= 12 THEN
                sp.account_count <= 4
            WHEN sp.size = 'midmarket' AND sp.tenure_months > 12 THEN
                sp.account_count <= 5
            WHEN sp.size = 'midmarket' AND sp.tenure_months <= 12 THEN
                sp.account_count <= 3
            ELSE true
        END as is_account_healthy,
        sp.size_mismatch_type,
        sp.has_industry_mismatch
    FROM mv_seller_performance sp
    WHERE 
        (p_manager_id IS NULL OR sp.manager_id = p_manager_id)
        AND (p_division IS NULL OR sp.division = p_division)
        AND (p_size IS NULL OR sp.size = p_size)
    ORDER BY sp.seller_name;
END;
$$ LANGUAGE plpgsql;

-- ==============================================
-- 4. AUTOMATED REFRESH SCHEDULE
-- ==============================================

-- Create a function to refresh views every 5 minutes
CREATE OR REPLACE FUNCTION schedule_performance_refresh()
RETURNS void AS $$
BEGIN
    -- This would typically be set up with pg_cron extension
    -- For now, we'll create a manual refresh function
    PERFORM refresh_performance_views();
END;
$$ LANGUAGE plpgsql;

-- ==============================================
-- 5. QUERY OPTIMIZATION HINTS
-- ==============================================

-- Enable query optimization
ALTER SYSTEM SET random_page_cost = 1.1;
ALTER SYSTEM SET effective_cache_size = '4GB';
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET work_mem = '64MB';

-- ==============================================
-- 6. MONITORING AND ANALYTICS
-- ==============================================

-- Create a view for query performance monitoring
CREATE OR REPLACE VIEW query_performance_stats AS
SELECT 
    schemaname,
    tablename,
    attname,
    n_distinct,
    correlation,
    most_common_vals,
    most_common_freqs
FROM pg_stats 
WHERE schemaname = 'public' 
AND tablename IN ('sellers', 'accounts', 'relationship_maps', 'managers', 'audit_logs');

-- Create a function to analyze slow queries
CREATE OR REPLACE FUNCTION analyze_slow_queries()
RETURNS TABLE (
    query_text TEXT,
    mean_time NUMERIC,
    calls BIGINT,
    total_time NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        query,
        mean_time,
        calls,
        total_time
    FROM pg_stat_statements 
    WHERE mean_time > 1000 -- Queries taking more than 1 second
    ORDER BY mean_time DESC
    LIMIT 10;
END;
$$ LANGUAGE plpgsql;

-- ==============================================
-- 7. GRANT PERMISSIONS
-- ==============================================

-- Grant permissions for the application user
GRANT SELECT ON mv_seller_performance TO authenticated;
GRANT SELECT ON mv_manager_performance TO authenticated;
GRANT SELECT ON mv_audit_stats TO authenticated;
GRANT EXECUTE ON FUNCTION get_seller_performance_with_health TO authenticated;
GRANT EXECUTE ON FUNCTION refresh_performance_views TO authenticated;
GRANT SELECT ON query_performance_stats TO authenticated;
GRANT EXECUTE ON FUNCTION analyze_slow_queries TO authenticated;
