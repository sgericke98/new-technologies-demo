import { supabase } from '@/integrations/supabase/client';

/**
 * Optimized Seller Detail Queries
 * This service provides optimized data fetching for the seller detail page
 * while maintaining all existing functionality and real-time updates
 */

// New unified account type with assignment status
export interface AccountWithAssignment {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  industry: string | null;
  size: string | null;
  tier: string | null;
  type: string | null;
  current_division: string;
  lat: number | null;
  lng: number | null;
  total_revenue: number;
  revenue_breakdown: {
    esg: number;
    gdt: number;
    gvc: number;
    msg_us: number;
  };
  assignment_status: 'available' | 'must_keep' | 'for_discussion' | 'to_be_peeled' | 'pinned' | 'assigned' | 'up_for_debate' | 'approval_for_pinning' | 'approval_for_assigning' | 'peeled';
  assigned_seller_id?: string;
  assigned_seller_name?: string;
  fit_percentage: number;
  is_available: boolean; // computed field
  is_original: boolean;
  isOriginal: boolean; // Alias for compatibility
}

export interface SellerDetailData {
  // Seller information
  seller: {
    id: string;
    name: string;
    division: string;
    size: string;
    tenure_months: number | null;
    industry_specialty: string | null;
    book_finalized: boolean;
    lat: number | null;
    lng: number | null;
    seniority_type: string | null;
    state: string | null;
    city: string | null;
    country: string | null;
  };
  
  // Account relationships with revenue
  originalAccounts: Array<{
    id: string;
    name: string;
    city: string | null;
    state: string | null;
    country: string | null;
    industry: string | null;
    size: string | null;
    tier: string | null;
    type: string | null;
    current_division: string;
    lat: number | null;
    lng: number | null;
    total_revenue: number;
    revenue_breakdown: {
      esg: number;
      gdt: number;
      gvc: number;
      msg_us: number;
    };
    isOriginal: true;
  }>;
  
  assignedAccounts: Array<{
    id: string;
    name: string;
    city: string | null;
    state: string | null;
    country: string | null;
    industry: string | null;
    size: string | null;
    tier: string | null;
    type: string | null;
    current_division: string;
    lat: number | null;
    lng: number | null;
    total_revenue: number;
    revenue_breakdown: {
      esg: number;
      gdt: number;
      gvc: number;
      msg_us: number;
    };
    status: 'must_keep' | 'for_discussion' | 'to_be_peeled' | 'pinned' | 'assigned' | 'up_for_debate' | 'approval_for_pinning' | 'approval_for_assigning' | 'peeled';
    isOriginal: false;
  }>;
  
  // NEW: All accounts with assignment status
  allAccounts: AccountWithAssignment[];
  
  // DEPRECATED: Legacy fields for backward compatibility
  // Use allAccounts instead - these will be removed in future versions
  availableAccounts: Array<{
    id: string;
    name: string;
    city: string | null;
    state: string | null;
    country: string | null;
    industry: string | null;
    size: string | null;
    tier: string | null;
    type: string | null;
    current_division: string;
    lat: number | null;
    lng: number | null;
    total_revenue: number;
    revenue_breakdown: {
      esg: number;
      gdt: number;
      gvc: number;
      msg_us: number;
    };
    fitPercentage?: number;
    isOriginal: false;
  }>;
  
  // DEPRECATED: Use allAccounts with assignment_status filter instead
  restrictedAccounts: Array<{
    id: string;
    name: string;
    city: string | null;
    state: string | null;
    country: string | null;
    industry: string | null;
    size: string | null;
    tier: string | null;
    type: string | null;
    current_division: string;
    lat: number | null;
    lng: number | null;
    total_revenue: number;
    revenue_breakdown: {
      esg: number;
      gdt: number;
      gvc: number;
      msg_us: number;
    };
    assigned_seller_id: string;
    assigned_seller_name: string;
    isOriginal: false;
  }>;
  
  // Revenue totals
  totalRevenue: number;
}

/**
 * Get optimized seller detail data using database views
 * This replaces multiple separate queries with optimized views
 */
export async function getSellerDetailData(sellerId: string): Promise<SellerDetailData> {
  try {
    // Use the optimized views to fetch all data in fewer queries
    const [
      sellerResult,
      originalAccountsResult,
      assignedAccountsResult,
      restrictedAccountsResult
    ] = await Promise.all([
      // 1. Get seller basic information
      supabase
        .from('sellers')
        .select('id, name, division, size, tenure_months, industry_specialty, book_finalized, lat, lng, seniority_type, state, city, country')
        .eq('id', sellerId)
        .single(),
      
      // 2. Get original relationships with revenue (using view)
      (supabase as any)
        .from('v_original_relationships_with_revenue')
        .select('*')
        .eq('seller_id', sellerId),
      
      // 3. Get current relationships with revenue (using view)
      (supabase as any)
        .from('v_seller_accounts_with_revenue')
        .select('*')
        .eq('seller_id', sellerId)
        .in('relationship_status', ['must_keep', 'for_discussion', 'to_be_peeled', 'pinned', 'assigned', 'up_for_debate', 'approval_for_pinning', 'approval_for_assigning', 'peeled']),
      
      // 4. Get restricted accounts (using view)
      (supabase as any)
        .from('v_restricted_accounts')
        .select('*')
    ]);

    // Check for errors
    if (sellerResult.error) throw sellerResult.error;
    if (originalAccountsResult.error) throw originalAccountsResult.error;
    if (assignedAccountsResult.error) throw assignedAccountsResult.error;
    if (restrictedAccountsResult.error) throw restrictedAccountsResult.error;

    const seller = sellerResult.data;
    const originalAccountsData = originalAccountsResult.data || [];
    const assignedAccountsData = assignedAccountsResult.data || [];
    const restrictedAccountsData = restrictedAccountsResult.data || [];

    // Process original accounts
    const originalAccounts = originalAccountsData.map((item: any) => ({
      id: item.id,
      name: item.name,
      city: item.city,
      state: item.state,
      country: item.country,
      industry: item.industry,
      size: item.size,
      tier: item.tier,
      type: item.type,
      current_division: item.current_division,
      lat: item.lat,
      lng: item.lng,
      total_revenue: item.total_revenue,
      revenue_breakdown: {
        esg: item.revenue_esg || 0,
        gdt: item.revenue_gdt || 0,
        gvc: item.revenue_gvc || 0,
        msg_us: item.revenue_msg_us || 0,
      },
      isOriginal: true as const,
    }));

    // Process assigned accounts
    const assignedAccounts = assignedAccountsData.map((item: any) => ({
      id: item.account_id,
      name: item.account_name,
      city: item.account_city,
      state: item.account_state,
      country: item.account_country,
      industry: item.account_industry,
      size: item.account_size,
      tier: item.account_tier,
      type: item.account_type,
      current_division: item.account_current_division,
      lat: item.account_lat,
      lng: item.account_lng,
      total_revenue: item.total_revenue,
      revenue_breakdown: {
        esg: item.revenue_esg || 0,
        gdt: item.revenue_gdt || 0,
        gvc: item.revenue_gvc || 0,
        msg_us: item.revenue_msg_us || 0,
      },
      status: item.relationship_status,
      isOriginal: false as const,
    }));

    // Note: Available accounts are now provided through allAccounts with assignment_status filtering
    // The legacy availableAccounts field is set to empty array for backward compatibility

    // Process restricted accounts
    const restrictedAccounts = restrictedAccountsData.map((item: any) => ({
      id: item.id,
      name: item.name,
      city: item.city,
      state: item.state,
      country: item.country,
      industry: item.industry,
      size: item.size,
      tier: item.tier,
      type: item.type,
      current_division: item.current_division,
      lat: item.lat,
      lng: item.lng,
      total_revenue: item.total_revenue,
      revenue_breakdown: {
        esg: item.revenue_esg || 0,
        gdt: item.revenue_gdt || 0,
        gvc: item.revenue_gvc || 0,
        msg_us: item.revenue_msg_us || 0,
      },
      assigned_seller_id: item.assigned_seller_id,
      assigned_seller_name: item.assigned_seller_name,
      isOriginal: false as const,
    }));

    // Calculate total revenue
    const totalRevenue = [...originalAccounts, ...assignedAccounts]
      .reduce((sum, account) => sum + account.total_revenue, 0);

    // Get all accounts with assignment status (NEW UNIFIED APPROACH)
    const allAccountsResult = await getAllAccountsWithAssignmentStatus(sellerId, 1, 1000); // Get all for now, can be paginated later
    
    return {
      seller: {
        ...seller,
        book_finalized: seller.book_finalized ?? false
      },
      originalAccounts,
      assignedAccounts,
      allAccounts: allAccountsResult.accounts, // NEW: All accounts with assignment status
      availableAccounts: [], // DEPRECATED: Legacy field - use allAccounts instead
      restrictedAccounts, // DEPRECATED: Use allAccounts with assignment_status filter instead
      totalRevenue,
    };
  } catch (error) {
    throw error;
  }
}

// Removed: getAvailableAccountsWithFitPaginated - Deprecated and replaced by getAllAccountsWithAssignmentStatus

/**
 * Get assigned accounts with pagination for a specific seller and status
 */
export async function getAssignedAccountsPaginated(
  sellerId: string,
  status: 'must_keep' | 'for_discussion' | 'to_be_peeled',
  page: number = 1,
  limit: number = 25,
  search?: string,
  filters?: {
    division?: string;
    size?: string;
    tier?: string;
    industry?: string;
    country?: string;
    state?: string;
  }
): Promise<{
  accounts: Array<{
    id: string;
    name: string;
    city: string | null;
    state: string | null;
    country: string | null;
    industry: string | null;
    size: string | null;
    tier: string | null;
    type: string | null;
    current_division: string;
    lat: number | null;
    lng: number | null;
    total_revenue: number;
    revenue_breakdown: {
      esg: number;
      gdt: number;
      gvc: number;
      msg_us: number;
    };
    status: string;
    isOriginal: false;
  }>;
  totalCount: number;
  totalPages: number;
  currentPage: number;
}> {
  try {
    const offset = (page - 1) * limit;

    // Build base query for relationship_maps with account joins
    let countQuery = (supabase as any)
      .from('relationship_maps')
      .select(`
        account_id,
        accounts!inner (
          id,
          name,
          city,
          state,
          country,
          industry,
          size,
          tier,
          type,
          current_division,
          lat,
          lng
        )
      `, { count: 'exact', head: true })
      .eq('seller_id', sellerId)
      .in('status', getStatusArray(status));

    let dataQuery = (supabase as any)
      .from('relationship_maps')
      .select(`
        account_id,
        status,
        accounts!inner (
          id,
          name,
          city,
          state,
          country,
          industry,
          size,
          tier,
          type,
          current_division,
          lat,
          lng
        )
      `)
      .eq('seller_id', sellerId)
      .in('status', getStatusArray(status));

    // Apply search filter
    if (search && search.trim() !== '') {
      countQuery = countQuery.ilike('accounts.name', `%${search.trim()}%`);
      dataQuery = dataQuery.ilike('accounts.name', `%${search.trim()}%`);
    }

    // Apply database-level filters using the !inner join syntax
    if (filters) {
      if (filters.division && filters.division !== 'all') {
        countQuery = countQuery.eq('accounts.current_division', filters.division);
        dataQuery = dataQuery.eq('accounts.current_division', filters.division);
      }
      if (filters.size && filters.size !== 'all') {
        countQuery = countQuery.eq('accounts.size', filters.size);
        dataQuery = dataQuery.eq('accounts.size', filters.size);
      }
      if (filters.tier && filters.tier !== 'all') {
        countQuery = countQuery.eq('accounts.tier', filters.tier);
        dataQuery = dataQuery.eq('accounts.tier', filters.tier);
      }
      if (filters.industry && filters.industry !== 'all') {
        countQuery = countQuery.eq('accounts.industry', filters.industry);
        dataQuery = dataQuery.eq('accounts.industry', filters.industry);
      }
      if (filters.country && filters.country !== 'all') {
        countQuery = countQuery.eq('accounts.country', filters.country);
        dataQuery = dataQuery.eq('accounts.country', filters.country);
      }
      if (filters.state && filters.state !== 'all') {
        countQuery = countQuery.eq('accounts.state', filters.state);
        dataQuery = dataQuery.eq('accounts.state', filters.state);
      }
    }

    // Get total count with filters applied
    const { count: totalCount, error: countError } = await countQuery;
    if (countError) throw countError;

    // Get ALL data (not paginated yet) to sort by revenue first
    const { data, error } = await dataQuery
      .order('updated_at', { ascending: false });

    if (error) throw error;

    // Get revenue data for ALL accounts
    const accountIds = data?.map((r: any) => r.account_id) || [];
    const { data: revenues } = await supabase
      .from("account_revenues")
      .select("*")
      .in("account_id", accountIds);

    // Process ALL accounts with revenue data
    const allAccountsWithRevenue = (data || []).map((r: any) => {
      const account = r.accounts;
      if (!account) return null;

      const revenue = revenues?.find(rev => rev.account_id === account.id);
      const breakdown = revenue ? {
        esg: Number(revenue.revenue_esg || 0),
        gdt: Number(revenue.revenue_gdt || 0),
        gvc: Number(revenue.revenue_gvc || 0),
        msg_us: Number(revenue.revenue_msg_us || 0),
      } : { esg: 0, gdt: 0, gvc: 0, msg_us: 0 };
      
      const total_revenue = breakdown.esg + breakdown.gdt + breakdown.gvc + breakdown.msg_us;
      return {
        id: account.id,
        name: account.name,
        city: account.city,
        state: account.state,
        country: account.country,
        industry: account.industry,
        size: account.size,
        tier: account.tier,
        type: account.type,
        current_division: account.current_division,
        lat: account.lat,
        lng: account.lng,
        total_revenue,
        revenue_breakdown: breakdown,
        status: r.status as any,
        isOriginal: false as const,
      };
    }).filter(Boolean);

    // Sort by total revenue descending BEFORE pagination
    allAccountsWithRevenue.sort((a: any, b: any) => b.total_revenue - a.total_revenue);

    // NOW apply pagination to the sorted results
    const accountsWithRevenue = allAccountsWithRevenue.slice(offset, offset + limit);

    const totalPages = Math.ceil((totalCount || 0) / limit);

    return {
      accounts: accountsWithRevenue,
      totalCount: totalCount || 0,
      totalPages,
      currentPage: page,
    };
  } catch (error) {
    throw error;
  }
}

// Helper function to get status array based on column type
function getStatusArray(status: 'must_keep' | 'for_discussion' | 'to_be_peeled'): string[] {
  switch (status) {
    case 'must_keep':
      return ['must_keep', 'pinned', 'approval_for_pinning'];
    case 'for_discussion':
      return ['for_discussion', 'assigned', 'up_for_debate', 'approval_for_assigning'];
    case 'to_be_peeled':
      return ['to_be_peeled', 'peeled'];
    default:
      return [];
  }
}

/**
 * Get original accounts with pagination for a specific seller
 */
export async function getOriginalAccountsPaginated(
  sellerId: string,
  page: number = 1,
  limit: number = 25,
  search?: string,
  filters?: {
    division?: string;
    size?: string;
    tier?: string;
    industry?: string;
    country?: string;
    state?: string;
  }
): Promise<{
  accounts: Array<{
    id: string;
    name: string;
    city: string | null;
    state: string | null;
    country: string | null;
    industry: string | null;
    size: string | null;
    tier: string | null;
    type: string | null;
    current_division: string;
    lat: number | null;
    lng: number | null;
    total_revenue: number;
    revenue_breakdown: {
      esg: number;
      gdt: number;
      gvc: number;
      msg_us: number;
    };
    status: string;
    isOriginal: true;
  }>;
  totalCount: number;
  totalPages: number;
  currentPage: number;
}> {
  try {
    const offset = (page - 1) * limit;

    // Build base query for original_relationships with account joins
    let countQuery = (supabase as any)
      .from('original_relationships')
      .select(`
        account_id,
        accounts!inner (
          id,
          name,
          city,
          state,
          country,
          industry,
          size,
          tier,
          type,
          current_division,
          lat,
          lng
        )
      `, { count: 'exact', head: true })
      .eq('seller_id', sellerId);

    let dataQuery = (supabase as any)
      .from('original_relationships')
      .select(`
        account_id,
        accounts!inner (
          id,
          name,
          city,
          state,
          country,
          industry,
          size,
          tier,
          type,
          current_division,
          lat,
          lng
        )
      `)
      .eq('seller_id', sellerId);

    // Apply search filter
    if (search && search.trim() !== '') {
      countQuery = countQuery.ilike('accounts.name', `%${search.trim()}%`);
      dataQuery = dataQuery.ilike('accounts.name', `%${search.trim()}%`);
    }

    // Apply database-level filters using the !inner join syntax
    if (filters) {
      if (filters.division && filters.division !== 'all') {
        countQuery = countQuery.eq('accounts.current_division', filters.division);
        dataQuery = dataQuery.eq('accounts.current_division', filters.division);
      }
      if (filters.size && filters.size !== 'all') {
        countQuery = countQuery.eq('accounts.size', filters.size);
        dataQuery = dataQuery.eq('accounts.size', filters.size);
      }
      if (filters.tier && filters.tier !== 'all') {
        countQuery = countQuery.eq('accounts.tier', filters.tier);
        dataQuery = dataQuery.eq('accounts.tier', filters.tier);
      }
      if (filters.industry && filters.industry !== 'all') {
        countQuery = countQuery.eq('accounts.industry', filters.industry);
        dataQuery = dataQuery.eq('accounts.industry', filters.industry);
      }
      if (filters.country && filters.country !== 'all') {
        countQuery = countQuery.eq('accounts.country', filters.country);
        dataQuery = dataQuery.eq('accounts.country', filters.country);
      }
      if (filters.state && filters.state !== 'all') {
        countQuery = countQuery.eq('accounts.state', filters.state);
        dataQuery = dataQuery.eq('accounts.state', filters.state);
      }
    }

    // Get total count with filters applied
    const { count: totalCount, error: countError } = await countQuery;
    if (countError) throw countError;

    // Get ALL data (not paginated yet) to sort by revenue first
    const { data, error } = await dataQuery
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Get revenue data for ALL accounts
    const accountIds = data?.map((r: any) => r.account_id) || [];
    const { data: revenues } = await supabase
      .from("account_revenues")
      .select("*")
      .in("account_id", accountIds);

    // Process ALL accounts with revenue data
    const allAccountsWithRevenue = (data || []).map((r: any) => {
      const account = r.accounts;
      if (!account) return null;

      const revenue = revenues?.find(rev => rev.account_id === account.id);
      const breakdown = revenue ? {
        esg: Number(revenue.revenue_esg || 0),
        gdt: Number(revenue.revenue_gdt || 0),
        gvc: Number(revenue.revenue_gvc || 0),
        msg_us: Number(revenue.revenue_msg_us || 0),
      } : { esg: 0, gdt: 0, gvc: 0, msg_us: 0 };
      
      const total_revenue = breakdown.esg + breakdown.gdt + breakdown.gvc + breakdown.msg_us;
      return {
        id: account.id,
        name: account.name,
        city: account.city,
        state: account.state,
        country: account.country,
        industry: account.industry,
        size: account.size,
        tier: account.tier,
        type: account.type,
        current_division: account.current_division,
        lat: account.lat,
        lng: account.lng,
        total_revenue,
        revenue_breakdown: breakdown,
        status: r.status,
        isOriginal: true as const,
      };
    }).filter(Boolean);

    // Sort by total revenue descending BEFORE pagination
    allAccountsWithRevenue.sort((a: any, b: any) => b.total_revenue - a.total_revenue);

    // NOW apply pagination to the sorted results
    const accountsWithRevenue = allAccountsWithRevenue.slice(offset, offset + limit);

    const totalPages = Math.ceil((totalCount || 0) / limit);

    return {
      accounts: accountsWithRevenue,
      totalCount: totalCount || 0,
      totalPages,
      currentPage: page,
    };
  } catch (error) {
    throw error;
  }
}

/**
 * Get all accounts with assignment status and fit percentage (NEW UNIFIED APPROACH)
 * This replaces the separate available/restricted logic with a single unified view
 */
export async function getAllAccountsWithAssignmentStatus(
  sellerId: string,
  page: number = 1,
  limit: number = 50,
  search?: string,
  sortBy: 'fit_percentage' | 'name' | 'total_revenue' = 'fit_percentage',
  sortOrder: 'asc' | 'desc' = 'desc',
  filters?: {
    division?: string;
    size?: string;
    tier?: string;
    industry?: string;
    country?: string;
    state?: string;
    assignment_status?: string; // NEW: Filter for assignment status
  }
): Promise<{
  accounts: AccountWithAssignment[];
  totalCount: number;
  totalPages: number;
  currentPage: number;
  limit: number;
}> {
  try {
    const { data, error } = await (supabase as any)
      .rpc('get_all_accounts_with_assignment_status', {
        seller_id_param: sellerId,
        page_param: page,
        limit_param: limit,
        search_param: search || null,
        sort_by_param: sortBy,
        sort_order_param: sortOrder,
        division_filter: filters?.division || null,
        size_filter: filters?.size || null,
        tier_filter: filters?.tier || null,
        industry_filter: filters?.industry || null,
        country_filter: filters?.country || null,
        state_filter: filters?.state || null,
        assignment_status_filter: filters?.assignment_status || null,
      });

    if (error) throw error;

    // The function returns a table, so we get an array of rows
    const rows = data as Array<{
      id: string;
      name: string;
      city: string | null;
      state: string | null;
      country: string | null;
      industry: string | null;
      size: string;
      tier: string | null;
      type: string | null;
      current_division: string;
      lat: number | null;
      lng: number | null;
      total_revenue: number;
      revenue_esg: number;
      revenue_gdt: number;
      revenue_gvc: number;
      revenue_msg_us: number;
      assignment_status: string;
      assigned_seller_id: string | null;
      assigned_seller_name: string | null;
      fit_percentage: number;
      total_count: number;
      total_pages: number;
      current_page: number;
      limit_per_page: number;
    }>;

    // Get pagination info from the first row (all rows have the same pagination info)
    const firstRow = rows[0];
    const paginationInfo = firstRow ? {
      totalCount: firstRow.total_count,
      totalPages: firstRow.total_pages,
      currentPage: firstRow.current_page,
      limit: firstRow.limit_per_page,
    } : {
      totalCount: 0,
      totalPages: 0,
      currentPage: page,
      limit: limit,
    };

    return {
      accounts: (rows || []).map((item) => ({
        id: item.id,
        name: item.name,
        city: item.city,
        state: item.state,
        country: item.country,
        industry: item.industry,
        size: item.size,
        tier: item.tier,
        type: item.type,
        current_division: item.current_division,
        lat: item.lat,
        lng: item.lng,
        total_revenue: item.total_revenue,
        revenue_breakdown: {
          esg: item.revenue_esg || 0,
          gdt: item.revenue_gdt || 0,
          gvc: item.revenue_gvc || 0,
          msg_us: item.revenue_msg_us || 0,
        },
        assignment_status: item.assignment_status as any,
        assigned_seller_id: item.assigned_seller_id || undefined,
        assigned_seller_name: item.assigned_seller_name || undefined,
        fit_percentage: item.fit_percentage,
        is_available: item.assignment_status === 'available',
        is_original: false, // This would need to be determined by checking original_relationships
        isOriginal: false, // Alias for compatibility
      })),
      ...paginationInfo,
    };
  } catch (error) {
    throw error;
  }
}

// Removed: getAvailableAccountsWithFit - Deprecated and replaced by getAllAccountsWithAssignmentStatus
// Removed: getAllUniqueFilterValues - Replaced by getAccountFilterOptions which uses efficient SQL DISTINCT queries

/**
 * Get seller revenue total (optimized query)
 */
export async function getSellerRevenue(sellerId: string): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('seller_revenue_view')
      .select('seller_total_revenue')
      .eq('seller_id', sellerId)
      .maybeSingle();

    if (error) throw error;
    return Number(data?.seller_total_revenue) || 0;
  } catch (error) {
    throw error;
  }
}

/**
 * Update account status (optimized with proper error handling)
 */
export async function updateAccountStatus(
  accountId: string,
  sellerId: string,
  newStatus: string,
  userId: string
): Promise<void> {
  try {
    const { error } = await supabase
      .from('relationship_maps')
      .update({
        status: newStatus as any,
        updated_at: new Date().toISOString()
      })
      .eq('account_id', accountId)
      .eq('seller_id', sellerId);

    if (error) throw error;
  } catch (error) {
    throw error;
  }
}

/**
 * Assign account to seller (optimized)
 */
export async function assignAccountToSeller(
  accountId: string,
  sellerId: string,
  userId: string,
  percentages: {
    pct_esg: number;
    pct_gdt: number;
    pct_gvc: number;
    pct_msg_us: number;
  }
): Promise<void> {
  try {
    const { error } = await supabase
      .from('relationship_maps')
      .insert({
        account_id: accountId,
        seller_id: sellerId,
        status: 'assigned',
        last_actor_user_id: userId,
        ...percentages,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (error) throw error;
  } catch (error) {
    throw error;
  }
}

/**
 * Unassign account from seller (optimized)
 */
export async function unassignAccountFromSeller(
  accountId: string,
  sellerId: string
): Promise<void> {
  try {
    const { error } = await supabase
      .from('relationship_maps')
      .delete()
      .eq('account_id', accountId)
      .eq('seller_id', sellerId);

    if (error) throw error;
  } catch (error) {
    throw error;
  }
}

/**
 * Get all possible filter options for accounts
 * This now uses a more efficient approach by getting all accounts at once
 */
export async function getAccountFilterOptions(): Promise<{
  divisions: string[];
  sizes: string[];
  tiers: string[];
  industries: string[];
  countries: string[];
  states: string[];
}> {
  try {
    // Fetch ALL distinct values efficiently using SQL DISTINCT (bypasses 1000 row limit)
    
    // Use raw SQL to get DISTINCT values efficiently - bypasses the 1000 row limit
    // This is much more efficient than fetching all 7000+ accounts
    const { data, error } = await (supabase as any).rpc('get_distinct_account_filters');
    
    if (error) {
      console.error('[getAccountFilterOptions] RPC error:', error);
      // Fallback to the old method if RPC doesn't exist yet
      console.warn('[getAccountFilterOptions] Falling back to direct queries...');
      return await getAccountFilterOptionsFallback();
    }

    // The RPC returns a single JSONB object with all the arrays
    const result = (data || {}) as {
      divisions: string[];
      sizes: string[];
      tiers: string[];
      industries: string[];
      countries: string[];
      states: string[];
    };
    
    // Successfully fetched all distinct filter values from database

    return {
      divisions: result.divisions || [],
      sizes: result.sizes || [],
      tiers: result.tiers || [],
      industries: result.industries || [],
      countries: result.countries || [],
      states: result.states || []
    };
  } catch (error) {
    console.error('[getAccountFilterOptions] Unexpected error:', error);
    // Fallback to direct queries
    return await getAccountFilterOptionsFallback();
  }
}

/**
 * Fallback method that queries each field separately to get ALL distinct values
 * This bypasses the 1000 row limit by using SQL DISTINCT
 */
async function getAccountFilterOptionsFallback(): Promise<{
  divisions: string[];
  sizes: string[];
  tiers: string[];
  industries: string[];
  countries: string[];
  states: string[];
}> {
  try {
    // Using fallback method with individual RPC calls for each field
    
    // Query each field separately using raw SQL to get ALL distinct values
    const [divisionsResult, sizesResult, tiersResult, industriesResult, countriesResult, statesResult] = await Promise.all([
      (supabase as any).rpc('get_distinct_divisions'),
      (supabase as any).rpc('get_distinct_sizes'),
      (supabase as any).rpc('get_distinct_tiers'),
      (supabase as any).rpc('get_distinct_industries'),
      (supabase as any).rpc('get_distinct_countries'),
      (supabase as any).rpc('get_distinct_states'),
    ]);

    // Extract and sort the results (cast to any to work with our custom RPC functions)
    const divisionsData = (divisionsResult.data || []) as any[];
    const sizesData = (sizesResult.data || []) as any[];
    const tiersData = (tiersResult.data || []) as any[];
    const industriesData = (industriesResult.data || []) as any[];
    const countriesData = (countriesResult.data || []) as any[];
    const statesData = (statesResult.data || []) as any[];
    
    const divisions = divisionsData.map((r: any) => r.current_division).filter(Boolean).sort();
    const sizes = sizesData.map((r: any) => r.size).filter(Boolean).sort();
    const tiers = tiersData.map((r: any) => r.tier).filter(Boolean).sort();
    const industries = industriesData.map((r: any) => r.industry).filter(Boolean).sort();
    const countries = countriesData.map((r: any) => r.country).filter(Boolean).sort();
    const states = statesData.map((r: any) => r.state).filter(Boolean).sort();

    // Successfully extracted filter options from fallback queries

    return {
      divisions,
      sizes,
      tiers,
      industries,
      countries,
      states
    };
  } catch (fallbackError) {
    console.error('[getAccountFilterOptionsFallback] All methods failed:', fallbackError);
    // Last resort: return empty arrays
    return {
      divisions: [],
      sizes: [],
      tiers: [],
      industries: [],
      countries: [],
      states: []
    };
  }
}
