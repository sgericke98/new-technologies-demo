'use client'

import { useParams, useRouter } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Loader2, Building2, LockIcon, DollarSign, Map, MapPin, Calendar, Search, Users, Target, TrendingUp, Shield, Globe, Briefcase, MessageCircle } from "lucide-react";
import React, { useEffect, useState, memo, useMemo, Suspense, lazy, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useAudit } from "@/hooks/use-audit";
import { DataLoader } from "@/components/ui/loader";
import { SellerChat } from "@/components/seller/SellerChat";

// Import optimized query service
import { 
  getSellerDetailData, 
  getSellerRevenue, 
  getAvailableAccountsWithFit,
  getAvailableAccountsWithFitPaginated,
  getAllAccountsWithAssignmentStatus, // NEW: Unified approach
  getAssignedAccountsPaginated,
  getOriginalAccountsPaginated,
  updateAccountStatus,
  assignAccountToSeller,
  unassignAccountFromSeller,
  getAccountFilterOptions,
  type SellerDetailData,
  type AccountWithAssignment // NEW: Type for unified accounts
} from "@/lib/seller-detail-queries";

// Import server action for cache invalidation
import { revalidateSellerData } from "../../../actions/revalidate";

// Import chart components directly for better performance
import { DivisionChart, StateChart, IndustryChart } from "@/components/charts/RevenueCharts";

type Account = {
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
  total_revenue: number;
  full_total_revenue?: number;
  revenue_breakdown: {
    esg: number;
    gdt: number;
    gvc: number;
    msg_us: number;
  };
  full_revenue_breakdown?: {
    esg: number;
    gdt: number;
    gvc: number;
    msg_us: number;
  };
  status?: 'assigned' | 'pinned' | 'must_keep' | 'for_discussion' | 'to_be_peeled' | 'approval_for_pinning' | 'approval_for_assigning' | 'up_for_debate' | 'peeled' | 'available';
  isOriginal: boolean;
  lat?: number | null;
  lng?: number | null;
  fitPercentage?: number;
  fit_percentage?: number; // NEW: From unified data structure
  // NEW: Assignment status fields
  assignment_status?: 'available' | 'must_keep' | 'for_discussion' | 'to_be_peeled' | 'pinned' | 'assigned' | 'up_for_debate' | 'approval_for_pinning' | 'approval_for_assigning' | 'peeled';
  assigned_seller_id?: string;
  assigned_seller_name?: string;
  is_available?: boolean;
};

type Seller = {
  id: string;
  name: string;
  division: string;
  city: string | null;
  state: string | null;
  tenure_months: number | null;
  size: string;
  industry_specialty: string | null;
  lat: number | null;
  lng: number | null;
  seniority_type: string | null;
};


// Note: Fit calculation is now handled by the database for better performance
// The database uses a 4-criteria algorithm (Division, Geography, Industry, Size)
// which is more efficient than the previous 5-criteria frontend approach

export default function SellerDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const { profile } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { logPin, logUnpin, logEvent, logAssign, logUnassign, logUpdate } = useAudit();
  const [authorized, setAuthorized] = useState(false);
  const [checking, setChecking] = useState(true);
  const [seller, setSeller] = useState<Seller | null>(null);
  const [originalAccounts, setOriginalAccounts] = useState<Account[]>([]);
  const [mustKeepAccounts, setMustKeepAccounts] = useState<Account[]>([]);
  const [forDiscussionAccounts, setForDiscussionAccounts] = useState<Account[]>([]);
  const [toBePeeledAccounts, setToBePeeledAccounts] = useState<Account[]>([]);
  const [availableAccounts, setAvailableAccounts] = useState<Account[]>([]);
  const [allAvailableAccounts, setAllAvailableAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Account search state
  const [accountSearchQuery, setAccountSearchQuery] = useState("");
  
  // Filter states
  const [filters, setFilters] = useState({
    division: "all",
    size: "all",
    tier: "all",
    industry: "all",
    country: "all",
    state: "all",
    assignment_status: "all" // NEW: Filter for assignment status
  });

  // Filter options state
  const [filterOptions, setFilterOptions] = useState({
    divisions: [] as string[],
    sizes: [] as string[],
    tiers: [] as string[],
    industries: [] as string[],
    countries: [] as string[],
    states: [] as string[]
  });
  
  // Book finalized state
  const [isBookFinalized, setIsBookFinalized] = useState(false);
  
  // Tab state
  const [activeTab, setActiveTab] = useState("pinning");
  
  // Preserve tab state across re-renders by using sessionStorage
  useEffect(() => {
    const savedTab = sessionStorage.getItem(`seller-tab-${id}`);
    if (savedTab && ["pinning", "exploration", "chat"].includes(savedTab)) {
      setActiveTab(savedTab);
    }
  }, [id]);

  // Save tab state when it changes
  useEffect(() => {
    sessionStorage.setItem(`seller-tab-${id}`, activeTab);
  }, [activeTab, id]);
  
  // Pagination state for performance
  const [accountsPerPage, setAccountsPerPage] = useState(25); // Show 25 accounts per column initially
  const [currentPage, setCurrentPage] = useState(1);
  
  // Pagination state for each column
  const [columnPages, setColumnPages] = useState({
    original: 1,
    must_keep: 1,
    for_discussion: 1,
    to_be_peeled: 1,
    available: 1
  });

  // Track loaded accounts for each column to support incremental loading
  const [loadedAccounts, setLoadedAccounts] = useState({
    original: [] as Account[],
    must_keep: [] as Account[],
    for_discussion: [] as Account[],
    to_be_peeled: [] as Account[],
    available: [] as Account[]
  });

  // Track total counts for each column
  const [totalCounts, setTotalCounts] = useState({
    original: 0,
    must_keep: 0,
    for_discussion: 0,
    to_be_peeled: 0,
    available: 0
  });
  
  // Track recently moved accounts to ensure they're visible
  const [recentlyMovedAccounts, setRecentlyMovedAccounts] = useState<Set<string>>(new Set());
  
  // Thresholds for visual indicators (will be fetched from database)
  const [revenueThreshold, setRevenueThreshold] = useState(10_000_000); // Keep for backward compatibility
  const [revenueMinThreshold, setRevenueMinThreshold] = useState(5_000_000);
  const [revenueMaxThreshold, setRevenueMaxThreshold] = useState(50_000_000);
  const [accountThreshold, setAccountThreshold] = useState(5);

  // Note: Fit calculation functions removed - now handled by database for better performance

  // Memoize expensive calculations - MUST be before any conditional returns
  // FIXED: Only count states from seller's specific accounts, not all available accounts
  const uniqueStates = useMemo(() => {
    return new Set(
      [...originalAccounts, ...mustKeepAccounts, ...forDiscussionAccounts, ...toBePeeledAccounts]
        .map(a => a.state)
        .filter(state => state !== null && state !== undefined && state !== '')
    );
  }, [originalAccounts, mustKeepAccounts, forDiscussionAccounts, toBePeeledAccounts]);

  const uniqueStatuses = useMemo(() => {
    return new Set(
      [...mustKeepAccounts, ...forDiscussionAccounts, ...toBePeeledAccounts, ...allAvailableAccounts]
        .map(a => a.status)
        .filter(status => status !== null && status !== undefined)
    );
  }, [mustKeepAccounts, forDiscussionAccounts, toBePeeledAccounts, allAvailableAccounts]);
  
  const uniqueIndustries = useMemo(() => {
    return new Set(
      [...originalAccounts, ...mustKeepAccounts, ...forDiscussionAccounts, ...toBePeeledAccounts, ...allAvailableAccounts]
        .map(a => a.industry)
        .filter(industry => industry !== null && industry !== undefined && industry !== '')
    );
  }, [originalAccounts, mustKeepAccounts, forDiscussionAccounts, toBePeeledAccounts, allAvailableAccounts]);
  
  const uniqueDivisions = useMemo(() => {
    return new Set(
      [...originalAccounts, ...mustKeepAccounts, ...forDiscussionAccounts, ...toBePeeledAccounts, ...allAvailableAccounts]
        .map(a => a.current_division)
        .filter(division => division !== null && division !== undefined && division !== '')
    );
  }, [originalAccounts, mustKeepAccounts, forDiscussionAccounts, toBePeeledAccounts, allAvailableAccounts]);

  const uniqueTiers = useMemo(() => {
    return new Set(
      [...originalAccounts, ...mustKeepAccounts, ...forDiscussionAccounts, ...toBePeeledAccounts, ...allAvailableAccounts]
        .map(a => a.tier)
        .filter(tier => tier !== null && tier !== undefined && tier !== '')
    );
  }, [originalAccounts, mustKeepAccounts, forDiscussionAccounts, toBePeeledAccounts, allAvailableAccounts]);

  const uniqueCountries = useMemo(() => {
    return new Set(
      [...originalAccounts, ...mustKeepAccounts, ...forDiscussionAccounts, ...toBePeeledAccounts, ...allAvailableAccounts]
        .map(a => a.country)
        .filter(country => country !== null && country !== undefined && country !== '')
    );
  }, [originalAccounts, mustKeepAccounts, forDiscussionAccounts, toBePeeledAccounts, allAvailableAccounts]);

  // Load filter options from database
  useEffect(() => {
    const loadFilterOptions = async () => {
      try {
        const options = await getAccountFilterOptions();
        setFilterOptions(options);
      } catch (error) {
        console.error('Error loading filter options:', error);
      }
    };

    loadFilterOptions();
  }, []);

  // Centralized cache invalidation function
  const invalidateAllSellerQueries = useCallback(async () => {
    // Invalidate React Query cache (client-side)
    queryClient.invalidateQueries({ queryKey: ["sellerRevenue"] });
    queryClient.invalidateQueries({ queryKey: ["sellerDetail", id] });
    queryClient.invalidateQueries({ queryKey: ["originalAccounts", id] });
    queryClient.invalidateQueries({ queryKey: ["mustKeepAccounts", id] });
    queryClient.invalidateQueries({ queryKey: ["forDiscussionAccounts", id] });
    queryClient.invalidateQueries({ queryKey: ["toBePeeledAccounts", id] });
    queryClient.invalidateQueries({ queryKey: ["availableAccounts", id] });
    queryClient.invalidateQueries({ queryKey: ["allAccountsWithAssignmentStatus", id] });
    queryClient.invalidateQueries({ queryKey: ["mustKeepPaginated", id] });
    queryClient.invalidateQueries({ queryKey: ["forDiscussionPaginated", id] });
    queryClient.invalidateQueries({ queryKey: ["toBePeeledPaginated", id] });
    queryClient.invalidateQueries({ queryKey: ["originalPaginated", id] });
    
    // Invalidate dashboard queries since they show seller data
    queryClient.invalidateQueries({ queryKey: ["unifiedDashboard"] });
    queryClient.invalidateQueries({ queryKey: ["unified-dashboard"], exact: false });
    queryClient.invalidateQueries({ queryKey: ["manager-performance"] });
    queryClient.invalidateQueries({ queryKey: ["sellers"] });
    
    // Invalidate Next.js server-side cache using server action
    try {
      await revalidateSellerData(id);
    } catch (error) {
      console.error('Error revalidating server cache:', error);
      // Don't throw - this is not critical for the user action
    }
  }, [queryClient, id]);

  // Note: Client-side filtering removed - now handled server-side for better performance

  // Memoize filtered accounts to prevent unnecessary re-filtering
  // Note: Using paginated queries now, so no need for client-side filtering

  // Note: Using server-side pagination now, so no need for client-side pagination logic
  
  // Note: Available accounts now use server-side pagination via availableAccountsWithFitPaginated

  // Function to fetch more available accounts from the database
  const fetchMoreAvailableAccounts = useCallback(async (page: number, limit: number = 25) => {
    try {
      // Get assigned account IDs first
      const { data: assignedAccounts } = await supabase
        .from("relationship_maps")
        .select("account_id")
        .in("status", ["must_keep", "for_discussion", "to_be_peeled", "pinned", "assigned", "up_for_debate", "approval_for_pinning", "approval_for_assigning", "peeled"]);

      const assignedAccountIds = assignedAccounts?.map(a => a.account_id) || [];

      // Use Supabase's built-in pagination with proper exclusion
      // If the exclusion list is too long, we'll use a different approach
      let availableAccounts, totalCount;
      
      if (assignedAccountIds.length > 500) {
        // For very large exclusion lists, use client-side filtering with server pagination
        
        // Get all accounts with server-side pagination
        const { data: allAccounts, error: allError, count: allCount } = await supabase
          .from("accounts")
          .select(`
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
          `, { count: 'exact' })
          .order('name');

        if (allError) throw allError;

        // Filter out assigned accounts client-side
        const assignedIdsSet = new Set(assignedAccountIds);
        const filteredAccounts = allAccounts?.filter(account => !assignedIdsSet.has(account.id)) || [];
        
        // Apply pagination to filtered results
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedAccounts = filteredAccounts.slice(startIndex, endIndex);
        
        availableAccounts = paginatedAccounts;
        totalCount = filteredAccounts.length;
      } else {
        // For smaller exclusion lists, use server-side exclusion
        const { data, error, count } = await supabase
          .from("accounts")
          .select(`
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
          `, { count: 'exact' })
          .not('id', 'in', `(${assignedAccountIds.join(',')})`)
          .range((page - 1) * limit, page * limit - 1)
          .order('name');

        if (error) {
          
          // Fallback: Get all accounts and filter client-side
          const { data: allAccounts, error: allError, count: allCount } = await supabase
            .from("accounts")
            .select(`
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
            `, { count: 'exact' })
            .order('name');

          if (allError) throw allError;

          // Filter out assigned accounts client-side
          const assignedIdsSet = new Set(assignedAccountIds);
          const filteredAccounts = allAccounts?.filter(account => !assignedIdsSet.has(account.id)) || [];
          
          // Apply pagination to filtered results
          const startIndex = (page - 1) * limit;
          const endIndex = startIndex + limit;
          const paginatedAccounts = filteredAccounts.slice(startIndex, endIndex);
          
          availableAccounts = paginatedAccounts;
          totalCount = filteredAccounts.length;
        } else {
          availableAccounts = data || [];
          totalCount = count || 0;
        }
      }

      // Get revenue data for these accounts
      const accountIds = availableAccounts.map(a => a.id);
      const { data: revenues } = await supabase
        .from("account_revenues")
        .select("*")
        .in("account_id", accountIds);

      // Process accounts with revenue data
      const accountsWithRevenue = availableAccounts.map(account => {
        const revenue = revenues?.find(rev => rev.account_id === account.id);
        const breakdown = revenue ? {
          esg: Number(revenue.revenue_esg || 0),
          gdt: Number(revenue.revenue_gdt || 0),
          gvc: Number(revenue.revenue_gvc || 0),
          msg_us: Number(revenue.revenue_msg_us || 0),
        } : { esg: 0, gdt: 0, gvc: 0, msg_us: 0 };
        
        const total_revenue = breakdown.esg + breakdown.gdt + breakdown.gvc + breakdown.msg_us;
        return {
          ...account,
          total_revenue,
          revenue_breakdown: breakdown,
          isOriginal: false,
          status: "available" as const,
        };
      });

      // Note: Sorting now handled by database for better performance
      const sortedAccounts = accountsWithRevenue;

      return {
        accounts: sortedAccounts,
        totalCount: totalCount
      };
    } catch (error) {
      throw error;
    }
  }, [seller]);

  // Handle loading more accounts for a specific column
  const handleLoadMore = useCallback(async (columnId: string) => {
    if (columnId === 'available') {
      try {
        const nextPage = columnPages.available + 1;
        const result = await fetchMoreAvailableAccounts(nextPage, accountsPerPage);
        
        // Add new accounts to the existing loaded accounts
        setLoadedAccounts(prev => ({
          ...prev,
          available: [...prev.available, ...result.accounts]
        }));
        
        // Update total count
        setTotalCounts(prev => ({
          ...prev,
          available: result.totalCount
        }));
        
        // Update page number
        setColumnPages(prev => ({
          ...prev,
          available: nextPage
        }));
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to load more accounts",
          variant: "destructive",
        });
      }
    } else {
      // For other columns, just increment the page (client-side pagination)
      setColumnPages(prev => ({
        ...prev,
        [columnId]: prev[columnId as keyof typeof prev] + 1
      }));
    }
  }, [columnPages.available, accountsPerPage, fetchMoreAvailableAccounts, toast]);

  // Handle finalized status change - memoized for performance
  const handleFinalizedChange = useCallback(async (finalized: boolean) => {
    try {
      const { error } = await supabase
        .from("sellers")
        .update({ book_finalized: finalized })
        .eq("id", id);

      if (error) throw error;

      // Log audit event
      await logEvent(
        finalized ? 'book_finalized' : 'book_unfinalized',
        'seller',
        id,
        { book_finalized: !finalized },
        { 
          book_finalized: finalized,
          seller_name: seller?.name,
          seller_division: seller?.division,
        }
      );

      setIsBookFinalized(finalized);
      
      // Refresh the materialized view to reflect changes (same as dashboard)
      try {
        await supabase.rpc('refresh_performance_views');
      } catch (refreshError) {
        // Don't throw error - this is not critical for the user action
      }
      
      // Invalidate queries to refresh dashboard data
      queryClient.invalidateQueries({ queryKey: ["sellers"] });
      queryClient.invalidateQueries({ queryKey: ["sellerRevenue"] });
      queryClient.invalidateQueries({ queryKey: ["unifiedDashboard"] });
      queryClient.invalidateQueries({ queryKey: ["manager-performance"] });
      
      // Revalidate the dashboard page to show updated data immediately
      queryClient.invalidateQueries({ queryKey: ["unified-dashboard"], exact: false });

      toast({
        title: "Status updated",
        description: `Seller's book of accounts ${finalized ? 'marked as finalized' : 'marked as not finalized'}.`,
      });
    } catch (error: any) {
      toast({
        title: "Update failed",
        description: error?.message ?? "Failed to update seller status",
        variant: "destructive",
      });
    }
  }, [id, seller, logEvent, queryClient, toast]);

  // OPTIMIZED: Use optimized revenue query with better caching
  const { data: revenueData } = useQuery({
    queryKey: ["sellerRevenue", id],
    queryFn: () => getSellerRevenue(id!),
    enabled: !!id && authorized,
    // Revenue changes more frequently - shorter cache
    staleTime: 30 * 1000,
    refetchInterval: 10 * 1000,
  });


  // Fetch threshold settings - MUST be called before any conditional logic
  useEffect(() => {
    const fetchThresholds = async () => {
      try {
        // TODO: Create threshold_settings table or use alternative approach
        // For now, use default values to avoid 404 errors
        setRevenueThreshold(10_000_000);
        setRevenueMinThreshold(5_000_000);
        setRevenueMaxThreshold(50_000_000);
        setAccountThreshold(5);
        
        // Commented out until threshold_settings table is created
        /*
        const { data, error } = await supabase
          .from('threshold_settings')
          .select('revenue_threshold, revenue_min_threshold, revenue_max_threshold, account_threshold')
          .single();

        if (error && error.code !== 'PGRST116') {
          return;
        }

        if (data) {
          setRevenueThreshold(data.revenue_threshold || 10_000_000); // Keep for backward compatibility
          setRevenueMinThreshold(data.revenue_min_threshold || 5_000_000);
          setRevenueMaxThreshold(data.revenue_max_threshold || 50_000_000);
          setAccountThreshold(data.account_threshold || 5);
        }
        */
      } catch (error) {
        // Use default values if there's an error
        setRevenueThreshold(10_000_000);
        setRevenueMinThreshold(5_000_000);
        setRevenueMaxThreshold(50_000_000);
        setAccountThreshold(5);
      }
    };

    fetchThresholds();
  }, []);

  useEffect(() => {
    (async () => {
      if (!profile || !id) {
        router.push("/dashboard");
        return;
      }

      if (profile.role === "MASTER") {
        setAuthorized(true);
        setChecking(false);
        return;
      }

      if (profile.role === "MANAGER") {
        // Check if the seller exists and if the current manager is assigned to this seller
        const { data: sellerManager } = await supabase
          .from("seller_managers")
          .select(`
            seller_id,
            managers!inner(user_id)
          `)
          .eq("seller_id", id)
          .eq("managers.user_id", profile.id)
          .maybeSingle();

        if (!sellerManager) {
          // Check if seller exists at all
          const { data: sellerExists } = await supabase
            .from("sellers")
            .select("id")
            .eq("id", id)
            .maybeSingle();

          if (!sellerExists) {
            toast({
              title: "Seller not found",
              description: "The requested seller does not exist.",
              variant: "destructive",
            });
          } else {
            toast({
              title: "Access denied",
              description: "You do not manage this seller.",
              variant: "destructive",
            });
          }
          router.push("/dashboard");
          return;
        }

        setAuthorized(true);
      }

      setChecking(false);
    })();
  }, [id, profile, router, toast]);

  // OPTIMIZED: Use single query with optimized caching strategy
  const { data: sellerDetailData, isLoading: sellerDetailLoading, error: sellerDetailError } = useQuery({
    queryKey: ["sellerDetail", id],
    queryFn: () => getSellerDetailData(id!),
    enabled: !!id && authorized,
    // Dynamic data - very short cache for immediate updates
    staleTime: 2 * 1000,
    // Refetch every 10 seconds
    refetchInterval: 10 * 1000,
    // Keep data fresh for 30 seconds
    gcTime: 30 * 1000,
  });

  // Pagination state for available accounts
  const [availableAccountsPage, setAvailableAccountsPage] = useState(1);
  const [availableAccountsSearch, setAvailableAccountsSearch] = useState('');
  const [availableAccountsSortBy, setAvailableAccountsSortBy] = useState<'fit_percentage' | 'name' | 'total_revenue'>('fit_percentage');
  const [availableAccountsSortOrder, setAvailableAccountsSortOrder] = useState<'asc' | 'desc'>('desc');
  const [availableAccountsLimit, setAvailableAccountsLimit] = useState(50);

  // Pagination state for must keep accounts
  const [mustKeepPage, setMustKeepPage] = useState(1);
  const [mustKeepLimit, setMustKeepLimit] = useState(25);

  // Pagination state for for discussion accounts
  const [forDiscussionPage, setForDiscussionPage] = useState(1);
  const [forDiscussionLimit, setForDiscussionLimit] = useState(25);

  // Pagination state for to be peeled accounts
  const [toBePeeledPage, setToBePeeledPage] = useState(1);
  const [toBePeeledLimit, setToBePeeledLimit] = useState(25);

  // Pagination state for original accounts
  const [originalPage, setOriginalPage] = useState(1);
  const [originalLimit, setOriginalLimit] = useState(25);

  // NEW UNIFIED APPROACH: Query for ALL accounts with assignment status (paginated)
  const { data: allAccountsWithAssignmentStatus } = useQuery({
    queryKey: ["allAccountsWithAssignmentStatus", id, availableAccountsPage, availableAccountsSearch, availableAccountsSortBy, availableAccountsSortOrder, availableAccountsLimit, filters.division, filters.size, filters.tier, filters.industry, filters.country, filters.state, filters.assignment_status],
    queryFn: () => getAllAccountsWithAssignmentStatus(
      id!,
      availableAccountsPage,
      availableAccountsLimit,
      availableAccountsSearch || undefined,
      availableAccountsSortBy,
      availableAccountsSortOrder,
      filters
    ),
    enabled: !!id && authorized,
  });

  // Legacy query for backward compatibility (will be removed)
  const { data: availableAccountsWithFitPaginated } = useQuery({
    queryKey: ["availableAccountsWithFitPaginated", id, availableAccountsPage, availableAccountsSearch, availableAccountsSortBy, availableAccountsSortOrder, availableAccountsLimit, filters.division, filters.size, filters.tier, filters.industry, filters.country, filters.state],
    queryFn: () => getAvailableAccountsWithFitPaginated(
      id!,
      availableAccountsPage,
      availableAccountsLimit,
      availableAccountsSearch || undefined,
      availableAccountsSortBy,
      availableAccountsSortOrder,
      filters
    ),
    enabled: false, // DISABLED - using new unified approach
  });


  // OPTIMIZED: Query for must keep accounts (paginated) - NO FILTERS APPLIED
  const { data: mustKeepPaginated } = useQuery({
    queryKey: ["mustKeepPaginated", id, mustKeepPage, mustKeepLimit],
    queryFn: () => getAssignedAccountsPaginated(id!, 'must_keep', mustKeepPage, mustKeepLimit),
    enabled: !!id && authorized,
  });

  // OPTIMIZED: Query for for discussion accounts (paginated) - NO FILTERS APPLIED
  const { data: forDiscussionPaginated } = useQuery({
    queryKey: ["forDiscussionPaginated", id, forDiscussionPage, forDiscussionLimit],
    queryFn: () => getAssignedAccountsPaginated(id!, 'for_discussion', forDiscussionPage, forDiscussionLimit),
    enabled: !!id && authorized,
  });

  // OPTIMIZED: Query for to be peeled accounts (paginated) - NO FILTERS APPLIED
  const { data: toBePeeledPaginated } = useQuery({
    queryKey: ["toBePeeledPaginated", id, toBePeeledPage, toBePeeledLimit],
    queryFn: () => getAssignedAccountsPaginated(id!, 'to_be_peeled', toBePeeledPage, toBePeeledLimit),
    enabled: !!id && authorized,
  });

  // OPTIMIZED: Query for original accounts (paginated) - NO FILTERS APPLIED
  const { data: originalPaginated } = useQuery({
    queryKey: ["originalPaginated", id, originalPage, originalLimit],
    queryFn: () => getOriginalAccountsPaginated(id!, originalPage, originalLimit),
    enabled: !!id && authorized,
  });

  // Handle status change via dropdown selection - memoized for performance
  const handleStatusChange = useCallback(async (accountId: string, newStatus: string) => {
    // Cast to proper Account status type
    const status = newStatus as Account['status'];
    if (!seller || !profile) {
      return;
    }

    // Find the account in all possible arrays (use paginated data)
    const account = [
      ...(originalPaginated?.accounts || []),
      ...(mustKeepPaginated?.accounts || []), 
      ...(forDiscussionPaginated?.accounts || []), 
      ...(toBePeeledPaginated?.accounts || []), 
      ...(allAccountsWithAssignmentStatus?.accounts || [])
    ].find(a => a.id === accountId);
    if (!account) {
      toast({
        title: "Error",
        description: "Account not found",
        variant: "destructive",
      });
      return;
    }

    const isCurrentlyAssignedToThisSeller = [
      ...(mustKeepPaginated?.accounts || []), 
      ...(forDiscussionPaginated?.accounts || []), 
      ...(toBePeeledPaginated?.accounts || [])
    ].some(a => a.id === accountId);
    const isFromAvailablePool = (allAccountsWithAssignmentStatus?.accounts || []).some(a => a.id === accountId);

    // Prevent moving original accounts to available (they are immutable)
    if (status === "available" && isCurrentlyAssignedToThisSeller) {
      const currentAccount = [
        ...(mustKeepPaginated?.accounts || []), 
        ...(forDiscussionPaginated?.accounts || []), 
        ...(toBePeeledPaginated?.accounts || [])
      ].find(a => a.id === accountId);
      if (currentAccount && currentAccount.isOriginal) {
        toast({
          title: "Cannot unassign account",
          description: `Account "${account.name}" is an original account and cannot be unassigned.`,
          variant: "destructive",
        });
        return;
      }
    }

    const isAssigning = status !== "available";
    const isMovingBetweenColumns = isCurrentlyAssignedToThisSeller && isAssigning;

    try {
      if (profile?.role === "MASTER") {
        if (isAssigning) {
          if (isMovingBetweenColumns) {
            // Update existing relationship
            const { error } = await supabase
              .from("relationship_maps")
              .update({ 
                status: status,
                updated_at: new Date().toISOString()
              })
              .eq("account_id", accountId)
              .eq("seller_id", id);

            if (error) {
              toast({
                title: "Error",
                description: `Failed to update account status: ${error.message}`,
                variant: "destructive",
              });
              return;
            }

            // Log audit event for status change
            try {
              await logUpdate("relationship", accountId, { status: (account as any).status }, { status: status });
            } catch (auditError) {
              // Don't fail the main operation for audit issues
            }

            // Track this account as recently moved to ensure it's visible
            setRecentlyMovedAccounts(prev => new Set([...Array.from(prev), accountId]));
            
            // Clear the recently moved flag after a delay
            setTimeout(() => {
              setRecentlyMovedAccounts(prev => {
                const newSet = new Set(prev);
                newSet.delete(accountId);
                return newSet;
              });
            }, 3000); // Clear after 3 seconds
            
            // Invalidate all seller-related queries
            await invalidateAllSellerQueries();
            
            // Refresh materialized view and revalidate dashboard for must_keep changes
            if (status === 'must_keep' || (account as any).status === 'must_keep') {
              try {
                await supabase.rpc('refresh_performance_views');
                queryClient.invalidateQueries({ queryKey: ["unifiedDashboard"] });
                queryClient.invalidateQueries({ queryKey: ["manager-performance"] });
                queryClient.invalidateQueries({ queryKey: ["unified-dashboard"], exact: false });
              queryClient.invalidateQueries({ queryKey: ["manager-performance"] });
                queryClient.invalidateQueries({ queryKey: ["forDiscussionPaginated", id] });
                queryClient.invalidateQueries({ queryKey: ["toBePeeledPaginated", id] });
                queryClient.invalidateQueries({ queryKey: ["originalPaginated", id] });
              } catch (refreshError) {
                // Don't throw error - this is not critical for the user action
              }
            }
            
            toast({
              title: "Account status updated",
              description: `${account.name} has been moved to ${status?.replace('_', ' ') || status}`,
            });
          } else {
            // Create new relationship (from available pool)
            let dbError = null;

            // Check if there's already a relationship for this account and seller
            const { data: existingRelationship } = await supabase
              .from("relationship_maps")
              .select("id")
              .eq("account_id", accountId)
              .eq("seller_id", id)
              .single();

            if (existingRelationship) {
              // Update existing relationship
              const { error } = await supabase
                .from("relationship_maps")
                .update({
                  status: status,
                  updated_at: new Date().toISOString()
                })
                .eq("account_id", accountId)
                .eq("seller_id", id);

              dbError = error;
            } else {
              // Create new relationship
              const { error } = await supabase
                .from("relationship_maps")
                .insert({
                  account_id: accountId,
                  seller_id: id,
                  status: status,
                  updated_at: new Date().toISOString()
                });

              dbError = error;
            }

            if (dbError) {
              toast({
                title: "Error",
                description: `Failed to assign account: ${dbError.message}`,
                variant: "destructive",
              });
              return;
            }

            // Log audit event for assignment
            try {
              const auditData = {
                account_id: accountId,
                seller_id: id,
                status: status,
                last_actor_user_id: profile.id,
                account_name: account.name,
                seller_name: seller.name,
              };
              await logAssign(accountId, auditData);
            } catch (auditError) {
              // Don't fail the main operation for audit issues
            }

            // Track this account as recently moved to ensure it's visible
            setRecentlyMovedAccounts(prev => new Set([...Array.from(prev), accountId]));
            
            // Clear the recently moved flag after a delay
            setTimeout(() => {
              setRecentlyMovedAccounts(prev => {
                const newSet = new Set(prev);
                newSet.delete(accountId);
                return newSet;
              });
            }, 3000); // Clear after 3 seconds
            
            // Invalidate all seller-related queries
            await invalidateAllSellerQueries();
            
            // Refresh materialized view and revalidate dashboard for must_keep assignments
            if (status === 'must_keep') {
              try {
                await supabase.rpc('refresh_performance_views');
                queryClient.invalidateQueries({ queryKey: ["unifiedDashboard"] });
                queryClient.invalidateQueries({ queryKey: ["manager-performance"] });
                queryClient.invalidateQueries({ queryKey: ["unified-dashboard"], exact: false });
              queryClient.invalidateQueries({ queryKey: ["manager-performance"] });
                queryClient.invalidateQueries({ queryKey: ["forDiscussionPaginated", id] });
                queryClient.invalidateQueries({ queryKey: ["toBePeeledPaginated", id] });
                queryClient.invalidateQueries({ queryKey: ["originalPaginated", id] });
              } catch (refreshError) {
                // Don't throw error - this is not critical for the user action
              }
            }
            
            toast({
              title: "Account assigned",
              description: `${account.name} has been assigned to ${seller.name}`,
            });
          }
        } else {
          // When moving to available, set status to "available"
          const { error } = await supabase
            .from("relationship_maps")
            .update({ 
              status: "available",
              updated_at: new Date().toISOString()
            })
            .eq("account_id", accountId)
            .eq("seller_id", id);

          if (error) {
            toast({
              title: "Error",
              description: `Failed to unassign account: ${error.message}`,
              variant: "destructive",
            });
            return;
          }

          // Log audit event for status change to available
          try {
            await logUpdate("relationship", accountId, { status: (account as any).status }, { status: "available" });
          } catch (auditError) {
            // Don't fail the main operation for audit issues
          }

          // Track this account as recently moved to ensure it's visible
          setRecentlyMovedAccounts(prev => new Set([...Array.from(prev), accountId]));
          
          // Clear the recently moved flag after a delay
          setTimeout(() => {
            setRecentlyMovedAccounts(prev => {
              const newSet = new Set(prev);
              newSet.delete(accountId);
              return newSet;
            });
          }, 3000); // Clear after 3 seconds

          // Invalidate all seller-related queries
          await invalidateAllSellerQueries();
          
          // Refresh materialized view and revalidate dashboard if account was in must_keep
          if ((account as any).status === 'must_keep') {
            try {
              await supabase.rpc('refresh_performance_views');
              queryClient.invalidateQueries({ queryKey: ["unifiedDashboard"] });
              queryClient.invalidateQueries({ queryKey: ["unified-dashboard"], exact: false });
              queryClient.invalidateQueries({ queryKey: ["manager-performance"] });
              queryClient.invalidateQueries({ queryKey: ["sellerDetail", id] });
            } catch (refreshError) {
              // Don't throw error - this is not critical for the user action
            }
          }

          queryClient.invalidateQueries({ queryKey: ["allAccountsWithAssignmentStatus", id] });
          queryClient.invalidateQueries({ queryKey: ["mustKeepPaginated", id] });
          queryClient.invalidateQueries({ queryKey: ["forDiscussionPaginated", id] });
          queryClient.invalidateQueries({ queryKey: ["toBePeeledPaginated", id] });
          queryClient.invalidateQueries({ queryKey: ["originalPaginated", id] });
          queryClient.invalidateQueries({ queryKey: ["sellerDetail", id] });

          toast({
            title: "Account unassigned",
            description: `${account.name} has been unassigned from ${seller.name}`,
          });
        }
      } else if (profile?.role === "MANAGER") {
        // MANAGER users use the same optimized functions as MASTER users
        if (isAssigning) {
          if (isMovingBetweenColumns) {
            // Update existing relationship
            const { error } = await supabase
              .from("relationship_maps")
              .update({ 
                status: status,
                updated_at: new Date().toISOString()
              })
              .eq("account_id", accountId)
              .eq("seller_id", id);

            if (error) {
              toast({
                title: "Error",
                description: `Failed to update account status: ${error.message}`,
                variant: "destructive",
              });
              return;
            }

            // Log audit event for status change
            try {
              await logUpdate("relationship", accountId, { status: (account as any).status }, { status: status });
            } catch (auditError) {
              // Don't fail the main operation for audit issues
            }

            // Track this account as recently moved to ensure it's visible
            setRecentlyMovedAccounts(prev => new Set([...Array.from(prev), accountId]));
            
            // Clear the recently moved flag after a delay
            setTimeout(() => {
              setRecentlyMovedAccounts(prev => {
                const newSet = new Set(prev);
                newSet.delete(accountId);
                return newSet;
              });
            }, 3000); // Clear after 3 seconds

            // Invalidate all seller-related queries
            await invalidateAllSellerQueries();

            toast({
              title: "Account status updated",
              description: `${account.name} status changed to ${status}`,
            });
          } else {
            // Create new relationship
            const { error } = await supabase
              .from("relationship_maps")
              .insert({
                account_id: accountId,
                seller_id: id,
                status: status,
                updated_at: new Date().toISOString()
              });

            if (error) {
              toast({
                title: "Error",
                description: `Failed to assign account: ${error.message}`,
                variant: "destructive",
              });
              return;
            }

            // Log audit event for assignment
            try {
              const auditData = {
                status: status,
                account_name: account.name,
                seller_name: seller.name,
              };
              await logAssign(accountId, auditData);
            } catch (auditError) {
              // Don't fail the main operation for audit issues
            }

            // Track this account as recently moved to ensure it's visible
            setRecentlyMovedAccounts(prev => new Set([...Array.from(prev), accountId]));
            
            // Clear the recently moved flag after a delay
            setTimeout(() => {
              setRecentlyMovedAccounts(prev => {
                const newSet = new Set(prev);
                newSet.delete(accountId);
                return newSet;
              });
            }, 3000); // Clear after 3 seconds

            // Invalidate all seller-related queries
            await invalidateAllSellerQueries();

            toast({
              title: "Account assigned",
              description: `${account.name} has been assigned to ${seller.name}`,
            });
          }
        } else {
          // Unassign account
          const { error } = await supabase
            .from("relationship_maps")
            .delete()
            .eq("account_id", accountId)
            .eq("seller_id", id);

          if (error) {
            toast({
              title: "Error",
              description: `Failed to unassign account: ${error.message}`,
              variant: "destructive",
            });
            return;
          }

          // Track this account as recently moved to ensure it's visible
          setRecentlyMovedAccounts(prev => new Set([...Array.from(prev), accountId]));
          
          // Clear the recently moved flag after a delay
          setTimeout(() => {
            setRecentlyMovedAccounts(prev => {
              const newSet = new Set(prev);
              newSet.delete(accountId);
              return newSet;
            });
          }, 3000); // Clear after 3 seconds

          // Invalidate all seller-related queries
          await invalidateAllSellerQueries();
          
          // Refresh materialized view and revalidate dashboard if account was in must_keep
          if ((account as any).status === 'must_keep') {
            try {
              await supabase.rpc('refresh_performance_views');
              queryClient.invalidateQueries({ queryKey: ["unifiedDashboard"] });
              queryClient.invalidateQueries({ queryKey: ["unified-dashboard"], exact: false });
              queryClient.invalidateQueries({ queryKey: ["manager-performance"] });
              queryClient.invalidateQueries({ queryKey: ["sellerDetail", id] });
            } catch (refreshError) {
              // Don't throw error - this is not critical for the user action
            }
          }

          queryClient.invalidateQueries({ queryKey: ["allAccountsWithAssignmentStatus", id] });
          queryClient.invalidateQueries({ queryKey: ["mustKeepPaginated", id] });
          queryClient.invalidateQueries({ queryKey: ["forDiscussionPaginated", id] });
          queryClient.invalidateQueries({ queryKey: ["toBePeeledPaginated", id] });
          queryClient.invalidateQueries({ queryKey: ["originalPaginated", id] });
          queryClient.invalidateQueries({ queryKey: ["sellerDetail", id] });

          toast({
            title: "Account unassigned",
            description: `${account.name} has been unassigned from ${seller.name}`,
          });
        }
      }
    } catch (error: any) {
      toast({
        title: "Unexpected Error",
        description: `An unexpected error occurred: ${error?.message || 'Unknown error'}`,
        variant: "destructive",
      });
    }
  }, [seller, profile, id, toast, logUpdate, logAssign, queryClient, originalPaginated, mustKeepPaginated, forDiscussionPaginated, toBePeeledPaginated, allAccountsWithAssignmentStatus]);

  // Reset pagination when filters change - ONLY for Available accounts
  useEffect(() => {
    setAvailableAccountsPage(1);
  }, [filters]);

  // OPTIMIZED: Process data when sellerDetailData changes
  useEffect(() => {
    if (!sellerDetailData) return;

    const { seller: sellerData, originalAccounts: original, assignedAccounts: assigned, availableAccounts: available, restrictedAccounts: restricted } = sellerDetailData;

    // Set seller data
    if (sellerData) {
      setSeller({
        id: sellerData.id,
        name: sellerData.name,
        division: sellerData.division,
        city: null, // Will be populated from other data if needed
        state: null, // Will be populated from other data if needed
        tenure_months: sellerData.tenure_months,
        size: sellerData.size,
        industry_specialty: sellerData.industry_specialty,
        lat: sellerData.lat,
        lng: sellerData.lng,
        seniority_type: sellerData.seniority_type,
      });
      setIsBookFinalized(sellerData.book_finalized || false);
    }

    // Set original accounts
    setOriginalAccounts(original);

    // Categorize assigned accounts by status
    const mustKeep = assigned.filter(account => 
      account.status === 'must_keep' || account.status === 'pinned' || account.status === 'approval_for_pinning'
    );
    
    const forDiscussion = assigned.filter(account => 
      account.status === 'for_discussion' || account.status === 'assigned' || account.status === 'up_for_debate' || account.status === 'approval_for_assigning'
    );
    
    const toBePeeled = assigned.filter(account => 
      account.status === 'to_be_peeled' || account.status === 'peeled'
    );

    setMustKeepAccounts(mustKeep);
    setForDiscussionAccounts(forDiscussion);
    setToBePeeledAccounts(toBePeeled);

    // Set available accounts (use new unified data)
    if (allAccountsWithAssignmentStatus) {
      setAllAvailableAccounts(allAccountsWithAssignmentStatus.accounts);
    } else {
      setAllAvailableAccounts(available);
    }

    setLoading(false);
  }, [sellerDetailData, allAccountsWithAssignmentStatus]);

  // Legacy query for backward compatibility - DISABLED since we're using optimized data
  const { data: accountData, isLoading: accountsLoading } = useQuery({
    queryKey: ["sellerAccounts", id],
    queryFn: async () => {
      // Batch all queries in parallel for better performance
      const [
        originalRelationshipsResult,
        relationshipsResult,
        restrictedAccountsResult,
        availableFromAnySellerResult,
        allAccountsResult,
        allAssignedAccountsResult
      ] = await Promise.all([
        supabase
          .from("original_relationships")
          .select(`
            account_id,
            accounts (
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
          .eq("seller_id", id),
        
        supabase
          .from("relationship_maps")
          .select(`
            account_id,
            status,
            accounts (
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
          .eq("seller_id", id)
          .in("status", ["must_keep", "for_discussion", "to_be_peeled", "approval_for_pinning", "approval_for_assigning", "pinned", "assigned", "up_for_debate", "peeled"]),
        
        supabase
          .from("relationship_maps")
          .select("account_id")
          .in("status", ["must_keep", "for_discussion", "to_be_peeled", "pinned", "assigned", "up_for_debate", "approval_for_pinning", "approval_for_assigning", "peeled"]),
        
        supabase
          .from("relationship_maps")
          .select(`
            account_id,
            accounts (
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
          .eq("status", "available"),
        
        supabase
          .from("accounts")
          .select(`
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
          `),
        
        supabase
          .from("relationship_maps")
          .select("account_id")
      ]);

      if (originalRelationshipsResult.error) throw originalRelationshipsResult.error;
      if (relationshipsResult.error) throw relationshipsResult.error;
      if (restrictedAccountsResult.error) throw restrictedAccountsResult.error;
      if (availableFromAnySellerResult.error) throw availableFromAnySellerResult.error;
      if (allAccountsResult.error) throw allAccountsResult.error;
      if (allAssignedAccountsResult.error) throw allAssignedAccountsResult.error;

      return {
        originalRelationships: originalRelationshipsResult.data,
        relationships: relationshipsResult.data,
        restrictedAccounts: restrictedAccountsResult.data,
        availableFromAnySeller: availableFromAnySellerResult.data,
        allAccounts: allAccountsResult.data,
        allAssignedAccounts: allAssignedAccountsResult.data
      };
    },
    enabled: false, // DISABLED - using optimized data instead
  });

  // DISABLED - using optimized data instead
  const { data: revenuesData } = useQuery({
    queryKey: ["accountRevenues", accountData?.relationships?.map(r => r.account_id)],
    queryFn: async () => {
      if (!accountData?.relationships) return [];
      
      const accountIds = accountData.relationships.map(r => r.account_id);
      const { data, error } = await supabase
        .from("account_revenues")
        .select("*")
        .in("account_id", accountIds);
      
      if (error) throw error;
      return data;
    },
    enabled: false, // DISABLED - using optimized data instead
  });

  // DISABLED - using optimized data processing instead
  useEffect(() => {
    return; // DISABLED - using optimized data processing instead
    if (!authorized) return;
    
    const fetchData = async () => {
      setLoading(true);
      
      // This is now handled by the optimized data processing useEffect above

      if (!accountData || !revenuesData) {
        setLoading(false);
        return;
      }

      const { originalRelationships, relationships, restrictedAccounts, availableFromAnySeller, allAccounts, allAssignedAccounts } = accountData;
      const revenues = revenuesData;
        

      // Process original accounts with simple revenue sum
      const originalAccountsWithRevenue = originalRelationships
        ?.map((r: any) => {
          const account = r.accounts;
          if (!account) return null;
          
          const revenue = revenues?.find(rev => rev.account_id === account.id);
          if (!revenue) return null;

          // Store full revenue data
          const fullRevenue = {
            esg: Number(revenue.revenue_esg || 0),
            gdt: Number(revenue.revenue_gdt || 0),
            gvc: Number(revenue.revenue_gvc || 0),
            msg_us: Number(revenue.revenue_msg_us || 0),
          };

          // Simple sum of all division revenues (no percentage weights)
          const total_revenue = fullRevenue.esg + fullRevenue.gdt + fullRevenue.gvc + fullRevenue.msg_us;
          
          return {
            ...account,
            total_revenue,
            full_total_revenue: total_revenue,
            revenue_breakdown: fullRevenue,
            full_revenue_breakdown: fullRevenue,
            isOriginal: true,
          };
        })
        .filter(Boolean) || [];

      // Process currently assigned accounts with simple revenue sum
      const assignedAccountsWithRevenue = relationships
        ?.map((r: any) => {
          const account = r.accounts;
          if (!account) return null;
          
          const revenue = revenues?.find(rev => rev.account_id === account.id);
          if (!revenue) return null;

          // Store full revenue data
          const fullRevenue = {
            esg: Number(revenue.revenue_esg || 0),
            gdt: Number(revenue.revenue_gdt || 0),
            gvc: Number(revenue.revenue_gvc || 0),
            msg_us: Number(revenue.revenue_msg_us || 0),
          };

          // Simple sum of all division revenues (no percentage weights)
          const total_revenue = fullRevenue.esg + fullRevenue.gdt + fullRevenue.gvc + fullRevenue.msg_us;
          
          return {
            ...account,
            total_revenue,
            full_total_revenue: total_revenue,
            revenue_breakdown: fullRevenue,
            full_revenue_breakdown: fullRevenue,
            status: r.status,
            isOriginal: false,
          };
        })
        .filter(Boolean) || [];

      
      // Separate accounts by status (handle both old and new statuses)
      const mustKeepAccounts = assignedAccountsWithRevenue.filter(account => 
        account.status === 'must_keep' || account.status === 'pinned' || account.status === 'approval_for_pinning'
      );
      
      const forDiscussionAccounts = assignedAccountsWithRevenue.filter(account => 
        account.status === 'for_discussion' || account.status === 'assigned' || account.status === 'up_for_debate' || account.status === 'approval_for_assigning'
      );
      const toBePeeledAccounts = assignedAccountsWithRevenue.filter(account => 
        account.status === 'to_be_peeled' || account.status === 'peeled'
      );
      
      setOriginalAccounts(originalAccountsWithRevenue);
      setMustKeepAccounts(mustKeepAccounts);
      setForDiscussionAccounts(forDiscussionAccounts);
      setToBePeeledAccounts(toBePeeledAccounts);

      const restrictedAccountIds = restrictedAccounts?.map(r => r.account_id) || [];
      
      // Process accounts from any seller with "available" status
      const availableFromAnySellerWithRevenue = availableFromAnySeller
        ?.map((r: any) => {
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
            ...account,
            total_revenue,
            revenue_breakdown: breakdown,
            isOriginal: false,
            status: "available" as const,
          };
        })
        .filter(Boolean) || [];

      // Get truly unassigned accounts (not assigned to ANY seller with any status)
      const allAssignedAccountIds = allAssignedAccounts?.map(r => r.account_id) || [];
      
      const trulyUnassigned = (allAccounts || [])
        .filter(a => !allAssignedAccountIds.includes(a.id))
        .map(a => {
          const revenue = revenues?.find(rev => rev.account_id === a.id);
          const breakdown = revenue ? {
            esg: Number(revenue.revenue_esg || 0),
            gdt: Number(revenue.revenue_gdt || 0),
            gvc: Number(revenue.revenue_gvc || 0),
            msg_us: Number(revenue.revenue_msg_us || 0),
          } : { esg: 0, gdt: 0, gvc: 0, msg_us: 0 };
          
          const total_revenue = breakdown.esg + breakdown.gdt + breakdown.gvc + breakdown.msg_us;
          return {
            ...a,
            total_revenue,
            revenue_breakdown: breakdown,
            isOriginal: false,
          };
        });

      // Combine truly unassigned accounts with available accounts from any seller
      const allAvailableAccounts = [...trulyUnassigned, ...availableFromAnySellerWithRevenue];

      // Note: Sorting now handled by database for better performance
      const sortedAvailable = allAvailableAccounts;
      
      // Initialize loaded accounts with the first page of available accounts
      const initialAvailableAccounts = sortedAvailable.slice(0, accountsPerPage);
      
      setAllAvailableAccounts(sortedAvailable);
      setAvailableAccounts(initialAvailableAccounts);
      setLoadedAccounts(prev => ({
        ...prev,
        available: initialAvailableAccounts
      }));
      setTotalCounts(prev => ({
        ...prev,
        available: sortedAvailable.length
      }));
      setLoading(false);
    };

    fetchData();
  }, [authorized, id, seller, accountData, revenuesData]);


  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!authorized) {
    return null;
  }


  const totalRevenue = revenueData ?? 0;
  const totalAccounts = mustKeepAccounts.length;
  const statesCount = uniqueStates.size;
  
  // Calculate indicators using revenue range
  const isRevenueHealthy = totalRevenue >= revenueMinThreshold && totalRevenue <= revenueMaxThreshold;
  const isAccountCountHealthy = totalAccounts <= accountThreshold;
  const location = seller?.city && seller?.state ? `${seller.city}, ${seller.state}` : "N/A";
  const tenure = seller?.tenure_months 
    ? `${Math.floor(seller.tenure_months / 12)}y ${seller.tenure_months % 12}m`
    : "N/A";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <AppHeader />
      
      <main className="w-full px-6 py-6 space-y-8">
        {/* Professional Header Section */}
        <div className="relative">
          {/* Navigation and Title */}
          <div className="flex items-center gap-4 mb-8">
            <Link href="/dashboard">
              <Button variant="outline" size="icon" className="shadow-sm hover:shadow-md transition-shadow">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="flex-1">
              <h1 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-2">{seller?.name || "Loading..."}</h1>
              <div className="flex items-center gap-4 text-sm text-slate-600">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="font-medium">Active Seller</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{location}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{tenure} tenure</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    seller?.seniority_type === 'senior' ? 'bg-green-500' : 'bg-blue-500'
                  }`}></div>
                  <span className="font-medium">
                    {seller?.seniority_type === 'senior' ? 'Senior' : 'Junior'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Compact Professional Seller Info Card */}
          {seller && (
            <div className="bg-gradient-to-br from-white via-slate-50 to-slate-100 rounded-2xl p-6 border border-slate-200/60 shadow-lg shadow-slate-200/20 mb-6 backdrop-blur-sm">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Seller Details */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow-md shadow-blue-500/25">
                      <Users className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">Seller Profile</h3>
                      <p className="text-xs text-slate-600">Professional attributes</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    {/* Division */}
                    <div className="group bg-white/70 backdrop-blur-sm rounded-lg p-3 border border-slate-200/60 shadow-sm hover:shadow-md transition-all duration-200 hover:border-blue-200">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="p-1 bg-blue-100 rounded-md">
                          <Building2 className="h-3.5 w-3.5 text-blue-600" />
                        </div>
                        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Division</span>
                      </div>
                      <Badge variant="secondary" className="px-2 py-1 text-xs font-bold bg-gradient-to-r from-blue-100 to-blue-200 text-blue-800 border-blue-300">
                        {seller.division}
                      </Badge>
                    </div>

                    {/* Size */}
                    <div className="group bg-white/70 backdrop-blur-sm rounded-lg p-3 border border-slate-200/60 shadow-sm hover:shadow-md transition-all duration-200 hover:border-emerald-200">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="p-1 bg-emerald-100 rounded-md">
                          <Users className="h-3.5 w-3.5 text-emerald-600" />
                        </div>
                        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Size</span>
                      </div>
                      <span className="text-sm font-bold text-slate-900 capitalize">
                        {seller.size}
                      </span>
                    </div>

                    {/* State */}
                    <div className="group bg-white/70 backdrop-blur-sm rounded-lg p-3 border border-slate-200/60 shadow-sm hover:shadow-md transition-all duration-200 hover:border-purple-200">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="p-1 bg-purple-100 rounded-md">
                          <MapPin className="h-3.5 w-3.5 text-purple-600" />
                        </div>
                        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">State</span>
                      </div>
                      <span className="text-sm font-bold text-slate-900">
                        {seller.state || "N/A"}
                      </span>
                    </div>

                    {/* Industry Specialty */}
                    {seller.industry_specialty && (
                      <div className="group bg-white/70 backdrop-blur-sm rounded-lg p-3 border border-slate-200/60 shadow-sm hover:shadow-md transition-all duration-200 hover:border-amber-200 col-span-2">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="p-1 bg-amber-100 rounded-md">
                            <Building2 className="h-3.5 w-3.5 text-amber-600" />
                          </div>
                          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Industry Focus</span>
                        </div>
                        <span className="text-sm font-bold text-slate-900 truncate block" title={seller.industry_specialty}>
                          {seller.industry_specialty}
                        </span>
                      </div>
                    )}

                    {/* Skill Level */}
                    <div className="group bg-white/70 backdrop-blur-sm rounded-lg p-3 border border-slate-200/60 shadow-sm hover:shadow-md transition-all duration-200 hover:border-green-200 col-span-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="p-1 bg-green-100 rounded-md">
                            <Target className="h-3.5 w-3.5 text-green-600" />
                          </div>
                          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Experience</span>
                        </div>
                        <Badge 
                          variant="outline" 
                          className={`px-3 py-1 text-xs font-bold ${
                            seller.seniority_type === 'senior'
                              ? 'bg-gradient-to-r from-green-100 to-green-200 text-green-800 border-green-300' 
                              : 'bg-gradient-to-r from-blue-100 to-blue-200 text-blue-800 border-blue-300'
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <div className={`w-1.5 h-1.5 rounded-full ${
                              seller.seniority_type === 'senior' ? 'bg-green-500' : 'bg-blue-500'
                            }`}></div>
                            {seller.seniority_type === 'senior' ? 'Senior' : 'Junior'}
                          </div>
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Compact Performance Metrics */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-lg shadow-md shadow-emerald-500/25">
                      <TrendingUp className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">Performance</h3>
                      <p className="text-xs text-slate-600">Revenue & account metrics</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    {/* Total Revenue */}
                    <div className="group bg-white/70 backdrop-blur-sm rounded-lg p-3 border border-slate-200/60 shadow-sm hover:shadow-md transition-all duration-200 hover:border-green-200">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="p-1 bg-green-100 rounded-md">
                          <DollarSign className="h-3.5 w-3.5 text-green-600" />
                        </div>
                        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Revenue</span>
                      </div>
                      <span className={`text-lg font-bold ${
                        isRevenueHealthy ? 'text-green-700' : 'text-red-700'
                      }`}>
                        {totalRevenue >= 1_000_000 
                          ? `$${(totalRevenue / 1_000_000).toFixed(1)}M`
                          : totalRevenue >= 1_000 
                          ? `$${(totalRevenue / 1_000).toFixed(0)}K`
                          : `$${totalRevenue.toFixed(0)}`
                        }
                      </span>
                    </div>

                    {/* Total Accounts */}
                    <div className="group bg-white/70 backdrop-blur-sm rounded-lg p-3 border border-slate-200/60 shadow-sm hover:shadow-md transition-all duration-200 hover:border-blue-200">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="p-1 bg-blue-100 rounded-md">
                          <Building2 className="h-3.5 w-3.5 text-blue-600" />
                        </div>
                        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Accounts</span>
                      </div>
                      <span className={`text-lg font-bold ${
                        isAccountCountHealthy ? 'text-green-700' : 'text-red-700'
                      }`}>
                        {totalAccounts}
                      </span>
                    </div>

                    {/* Geographic Reach */}
                    <div className="group bg-white/70 backdrop-blur-sm rounded-lg p-3 border border-slate-200/60 shadow-sm hover:shadow-md transition-all duration-200 hover:border-purple-200">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="p-1 bg-purple-100 rounded-md">
                          <Map className="h-3.5 w-3.5 text-purple-600" />
                        </div>
                        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">States</span>
                      </div>
                      <span className="text-lg font-bold text-slate-900">{statesCount}</span>
                    </div>

                    {/* Book Status */}
                    <div className="group bg-white/70 backdrop-blur-sm rounded-lg p-3 border border-slate-200/60 shadow-sm hover:shadow-md transition-all duration-200 hover:border-amber-200">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className="p-1 bg-amber-100 rounded-md">
                            <Shield className="h-3.5 w-3.5 text-amber-600" />
                          </div>
                          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Status</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className={`w-1.5 h-1.5 rounded-full ${
                            isBookFinalized ? 'bg-green-500' : 'bg-yellow-500'
                          }`}></div>
                          <span className="text-xs font-bold text-slate-900">
                            {isBookFinalized ? 'Final' : 'Draft'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="book-finalized"
                          checked={isBookFinalized}
                          onCheckedChange={(checked) => handleFinalizedChange(checked as boolean)}
                          className="h-4 w-4"
                        />
                        <label 
                          htmlFor="book-finalized"
                          className="text-xs font-medium cursor-pointer text-slate-700 hover:text-slate-900 transition-colors"
                        >
                          Mark finalized
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Professional Revenue Analysis with Charts */}
        {seller && (
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 border border-slate-200 shadow-lg mb-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-6">Revenue Analysis</h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Revenue by Division - Pie Chart */}
              <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-6 border border-slate-200">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Revenue by Division</h3>
                <DivisionChart assignedAccounts={mustKeepAccounts} totalRevenue={totalRevenue} />
              </div>

              {/* Revenue by State - Bar Chart */}
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-200">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Revenue by State</h3>
                <StateChart assignedAccounts={mustKeepAccounts} totalRevenue={totalRevenue} />
              </div>

              {/* Revenue by Industry - Bar Chart */}
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-6 border border-purple-200">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Revenue by Industry</h3>
                <IndustryChart assignedAccounts={mustKeepAccounts} totalRevenue={totalRevenue} />
              </div>
            </div>
          </div>
        )}

        {/* Professional Account Assignment Section */}
        <Card className="shadow-xl border-0 bg-white overflow-hidden">
          <CardHeader className="pb-6 bg-white border-b border-slate-200">
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg shadow-sm">
                    <Users className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-2xl font-bold text-slate-900">Account Assignment</CardTitle>
                    <p className="text-sm text-slate-600 mt-1">Manage account assignments and status changes</p>
                  </div>
                </div>
                
                <CardDescription className="text-slate-600 mb-4">
                  Use the dropdown selectors on each account to change their status. Changes are immediate for all users.
                </CardDescription>
                
                {/* Enhanced Protection Notice */}
                <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-amber-100 rounded-lg flex-shrink-0">
                      <LockIcon className="h-4 w-4 text-amber-700" />
                    </div>
                    <div className="text-sm text-amber-800">
                      <p className="font-semibold mb-2 text-amber-900">Account Status Protection</p>
                      <p className="text-xs leading-relaxed">
                        Accounts with "Must Keep", "For Discussion", or "To be Peeled" status are protected from being assigned to other sellers. 
                        You can still move your own accounts between statuses or unassign them. Only truly unassigned accounts appear in the "Available" pool for other sellers.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Professional Legend */}
              <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-slate-200 shadow-sm">
                <h4 className="text-sm font-semibold text-slate-900 mb-3">Status Legend</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-3 h-3 bg-blue-500 rounded-full shadow-sm"></div>
                    <span className="text-slate-700 font-medium">Original</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-3 h-3 bg-green-500 rounded-full shadow-sm"></div>
                    <span className="text-slate-700 font-medium">Must Keep</span>
                    <LockIcon className="h-3 w-3 text-green-600" />
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-3 h-3 bg-yellow-500 rounded-full shadow-sm"></div>
                    <span className="text-slate-700 font-medium">For Discussion</span>
                    <LockIcon className="h-3 w-3 text-yellow-600" />
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-3 h-3 bg-red-500 rounded-full shadow-sm"></div>
                    <span className="text-slate-700 font-medium">To be Peeled</span>
                    <LockIcon className="h-3 w-3 text-red-600" />
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-3 h-3 bg-slate-400 rounded-full shadow-sm"></div>
                    <span className="text-slate-700 font-medium">Available</span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Enhanced Account Summary Stats */}
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 px-2">
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200 shadow-sm hover:shadow-lg hover:scale-105 transition-all duration-200 cursor-pointer group">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-blue-100 rounded-lg group-hover:bg-blue-200 transition-colors">
                    <div className="w-3 h-3 bg-blue-500 rounded-full shadow-sm"></div>
                  </div>
                  <div>
                    <span className="text-sm font-bold text-blue-800">Original</span>
                    <p className="text-xs text-blue-600 font-medium">Base accounts</p>
                  </div>
                </div>
                <p className="text-3xl font-bold text-blue-900 group-hover:text-blue-800 transition-colors">{originalAccounts.length}</p>
              </div>
              
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-4 border border-green-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-1.5 bg-green-100 rounded-lg">
                    <div className="w-2.5 h-2.5 bg-green-500 rounded-full"></div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-green-800">Must Keep</span>
                      <LockIcon className="h-3 w-3 text-green-600" />
                    </div>
                    <p className="text-xs text-green-600">Protected</p>
                  </div>
                </div>
                <p className="text-3xl font-bold text-green-900">{mustKeepAccounts.length}</p>
              </div>
              
              <div className="bg-gradient-to-br from-yellow-50 to-amber-50 rounded-xl p-4 border border-yellow-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-1.5 bg-yellow-100 rounded-lg">
                    <div className="w-2.5 h-2.5 bg-yellow-500 rounded-full"></div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-yellow-800">Discussion</span>
                      <LockIcon className="h-3 w-3 text-yellow-600" />
                    </div>
                    <p className="text-xs text-yellow-600">Protected</p>
                  </div>
                </div>
                <p className="text-3xl font-bold text-yellow-900">{forDiscussionAccounts.length}</p>
              </div>
              
              <div className="bg-gradient-to-br from-red-50 to-rose-50 rounded-xl p-4 border border-red-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-1.5 bg-red-100 rounded-lg">
                    <div className="w-2.5 h-2.5 bg-red-500 rounded-full"></div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-red-800">To Peel</span>
                      <LockIcon className="h-3 w-3 text-red-600" />
                    </div>
                    <p className="text-xs text-red-600">Protected</p>
                  </div>
                </div>
                <p className="text-3xl font-bold text-red-900">{toBePeeledAccounts.length}</p>
              </div>
              
              <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-4 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-1.5 bg-slate-100 rounded-lg">
                    <div className="w-2.5 h-2.5 bg-slate-400 rounded-full"></div>
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-slate-800">Available</span>
                    <p className="text-xs text-slate-600">Unassigned</p>
                  </div>
                </div>
                <p className="text-3xl font-bold text-slate-900">{allAccountsWithAssignmentStatus?.totalCount || 0}</p>
              </div>
            </div>
          </CardHeader>
          
           {/* Professional Filter Controls */}
           <div className="px-6 pb-8 space-y-6 bg-white">
            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-1.5 bg-blue-100 rounded-lg">
                  <Target className="h-4 w-4 text-blue-600" />
                </div>
                <h3 className="text-sm font-semibold text-slate-900">Filter Available Accounts</h3>
                <p className="text-xs text-slate-600 mt-1">Filters only apply to the Available accounts column</p>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
                {/* Division Filter */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Division</label>
                  <Select
                    value={filters.division}
                    onValueChange={(value) => setFilters(prev => ({ ...prev, division: value }))}
                  >
                    <SelectTrigger className="h-10 border-slate-200 focus:border-blue-400 focus:ring-blue-400 rounded-lg">
                      <SelectValue placeholder="All divisions" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All divisions</SelectItem>
                      {filterOptions.divisions.map(division => (
                        <SelectItem key={division} value={division || ""}>
                          {division}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Size Filter */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Size</label>
                  <Select
                    value={filters.size}
                    onValueChange={(value) => setFilters(prev => ({ ...prev, size: value }))}
                  >
                    <SelectTrigger className="h-10 border-slate-200 focus:border-blue-400 focus:ring-blue-400 rounded-lg">
                      <SelectValue placeholder="All sizes" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All sizes</SelectItem>
                      {filterOptions.sizes.map(size => (
                        <SelectItem key={size} value={size || ""}>
                          {size}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Tier Filter */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Tier</label>
                  <Select
                    value={filters.tier}
                    onValueChange={(value) => setFilters(prev => ({ ...prev, tier: value }))}
                  >
                    <SelectTrigger className="h-10 border-slate-200 focus:border-blue-400 focus:ring-blue-400 rounded-lg">
                      <SelectValue placeholder="All tiers" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All tiers</SelectItem>
                      {filterOptions.tiers.map(tier => (
                        <SelectItem key={tier} value={tier || ""}>
                          {tier}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Industry Filter */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Industry</label>
                  <Select
                    value={filters.industry}
                    onValueChange={(value) => setFilters(prev => ({ ...prev, industry: value }))}
                  >
                    <SelectTrigger className="h-10 border-slate-200 focus:border-blue-400 focus:ring-blue-400 rounded-lg">
                      <SelectValue placeholder="All industries" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All industries</SelectItem>
                      {filterOptions.industries.map(industry => (
                        <SelectItem key={industry} value={industry || ""}>
                          {industry}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Country Filter */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Country</label>
                  <Select
                    value={filters.country}
                    onValueChange={(value) => setFilters(prev => ({ ...prev, country: value }))}
                  >
                    <SelectTrigger className="h-10 border-slate-200 focus:border-blue-400 focus:ring-blue-400 rounded-lg">
                      <SelectValue placeholder="All countries" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All countries</SelectItem>
                      {filterOptions.countries.map(country => (
                        <SelectItem key={country} value={country || ""}>
                          {country}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* State Filter */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">State</label>
                  <Select
                    value={filters.state}
                    onValueChange={(value) => setFilters(prev => ({ ...prev, state: value }))}
                  >
                    <SelectTrigger className="h-10 border-slate-200 focus:border-blue-400 focus:ring-blue-400 rounded-lg">
                      <SelectValue placeholder="All states" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All states</SelectItem>
                      {filterOptions.states.map(state => (
                        <SelectItem key={state} value={state || ""}>
                          {state}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Assignment Status Filter */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Assignment Status</label>
                  <Select
                    value={filters.assignment_status}
                    onValueChange={(value) => setFilters(prev => ({ ...prev, assignment_status: value }))}
                  >
                    <SelectTrigger className="h-10 border-slate-200 focus:border-blue-400 focus:ring-blue-400 rounded-lg">
                      <SelectValue placeholder="All accounts" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All accounts</SelectItem>
                      <SelectItem value="available">Unassigned only</SelectItem>
                      <SelectItem value="assigned">Assigned only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

              </div>
            </div>

            {/* Professional Clear Filters and Results Summary */}
            {(filters.division !== "all" || filters.size !== "all" || filters.tier !== "all" || filters.industry !== "all" || filters.country !== "all" || filters.state !== "all" || filters.assignment_status !== "all" || accountSearchQuery) && (
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-blue-100 rounded-lg">
                      <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-blue-900">
                        Showing {allAccountsWithAssignmentStatus?.totalCount || 0} accounts (all accounts with assignment status)
                      </p>
                      <p className="text-xs text-blue-700">
                        {accountSearchQuery && `Matching "${accountSearchQuery}"`}
                        {(filters.division !== "all" || filters.size !== "all" || filters.tier !== "all" || filters.industry !== "all" || filters.country !== "all" || filters.state !== "all" || filters.assignment_status !== "all") && ' with applied filters'}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setFilters({ division: "all", size: "all", tier: "all", industry: "all", country: "all", state: "all", assignment_status: "all" });
                      setAccountSearchQuery("");
                    }}
                    className="text-xs border-blue-300 text-blue-700 hover:bg-blue-100"
                  >
                    Clear All
                  </Button>
                </div>
              </div>
            )}
          </div>
          
          <CardContent className="pt-2">
            {(loading || sellerDetailLoading) ? (
              <DataLoader text="Loading account data..." />
            ) : (
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-3 mb-6">
                  <TabsTrigger value="pinning" className="flex items-center gap-2">
                    <Target className="h-4 w-4" />
                    Account Pinning
                  </TabsTrigger>
                  <TabsTrigger value="exploration" className="flex items-center gap-2">
                    <Search className="h-4 w-4" />
                    Account Exploration
                  </TabsTrigger>
                  <TabsTrigger value="chat" className="flex items-center gap-2">
                    <MessageCircle className="h-4 w-4" />
                    Chat
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="pinning" className="mt-0">
                  <div className="h-[800px] rounded-xl border border-slate-200 shadow-lg bg-white grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-0 overflow-y-auto">
                    {/* Original Accounts - Always visible now */}
                    <div className="border-r border-slate-200 min-w-0 w-full bg-gradient-to-b from-blue-50/30 to-transparent">
                      <AccountColumn
                        id="original"
                        title="Original Accounts"
                        accounts={(originalPaginated?.accounts || []) as Account[]}
                        totalCount={originalPaginated?.totalCount || 0}
                        emptyMessage="No original accounts"
                        isReadOnly
                        recentlyMovedAccounts={recentlyMovedAccounts}
                        paginationData={originalPaginated}
                        currentPage={originalPage}
                        onPageChange={setOriginalPage}
                      />
                    </div>
                    
                    {/* Must Keep */}
                    <div className="border-r border-slate-200 min-w-0 w-full bg-gradient-to-b from-green-50/30 to-transparent">
                      <AccountColumn
                        id="must_keep"
                        title="Must Keep"
                        accounts={(mustKeepPaginated?.accounts || []) as Account[]}
                        totalCount={mustKeepPaginated?.totalCount || 0}
                        emptyMessage="No accounts marked as must keep"
                        userRole={profile?.role}
                        onStatusChange={handleStatusChange}
                        recentlyMovedAccounts={recentlyMovedAccounts}
                        paginationData={mustKeepPaginated}
                        currentPage={mustKeepPage}
                        onPageChange={setMustKeepPage}
                      />
                    </div>
                    
                    {/* For Discussion */}
                    <div className="border-r border-slate-200 min-w-0 w-full bg-gradient-to-b from-yellow-50/30 to-transparent">
                      <AccountColumn
                        id="for_discussion"
                        title="For Discussion"
                        accounts={(forDiscussionPaginated?.accounts || []) as Account[]}
                        totalCount={forDiscussionPaginated?.totalCount || 0}
                        emptyMessage="No accounts for discussion"
                        userRole={profile?.role}
                        onStatusChange={handleStatusChange}
                        recentlyMovedAccounts={recentlyMovedAccounts}
                        paginationData={forDiscussionPaginated}
                        currentPage={forDiscussionPage}
                        onPageChange={setForDiscussionPage}
                      />
                    </div>
                    
                    {/* To be Peeled */}
                    <div className="min-w-0 w-full bg-gradient-to-b from-red-50/30 to-transparent">
                      <AccountColumn
                        id="to_be_peeled"
                        title="To be Peeled"
                        accounts={(toBePeeledPaginated?.accounts || []) as Account[]}
                        totalCount={toBePeeledPaginated?.totalCount || 0}
                        emptyMessage="No accounts to be peeled"
                        userRole={profile?.role}
                        onStatusChange={handleStatusChange}
                        recentlyMovedAccounts={recentlyMovedAccounts}
                        paginationData={toBePeeledPaginated}
                        currentPage={toBePeeledPage}
                        onPageChange={setToBePeeledPage}
                      />
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="exploration" className="mt-0">
                  <div className="min-h-[800px] rounded-xl border border-slate-200 shadow-lg bg-white overflow-hidden">
                    <div className="w-full bg-gradient-to-b from-slate-50/30 to-transparent">
                      <AccountTable
                        id="available"
                        title="All Accounts (with assignment status)"
                        accounts={allAccountsWithAssignmentStatus?.accounts || []}
                        totalCount={allAccountsWithAssignmentStatus?.totalCount || 0}
                        emptyMessage="No accounts found"
                        userRole={profile?.role}
                        onStatusChange={handleStatusChange}
                        recentlyMovedAccounts={recentlyMovedAccounts}
                        paginationData={allAccountsWithAssignmentStatus}
                        currentPage={availableAccountsPage}
                        onPageChange={setAvailableAccountsPage}
                        searchQuery={availableAccountsSearch}
                        onSearchChange={(query) => {
                          setAvailableAccountsSearch(query);
                          setAvailableAccountsPage(1); // Reset to first page when searching
                        }}
                        isExplorationMode={true}
                      />
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="chat" className="mt-0">
                  <SellerChat
                    sellerId={id}
                    sellerName={sellerDetailData?.seller?.name || seller?.name || 'Unknown Seller'}
                  />
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

const AccountColumn = memo(function AccountColumn({ 
  id, 
  title, 
  accounts, 
  totalCount,
  emptyMessage,
  isReadOnly,
  userRole,
  onStatusChange,
  recentlyMovedAccounts,
  paginationData,
  currentPage,
  onPageChange,
  searchQuery,
  onSearchChange,
  isExplorationMode = false,
}: { 
  id: string;
  title: string;
  accounts: Account[];
  totalCount?: number;
  emptyMessage: string;
  isReadOnly?: boolean;
  userRole?: string;
  onStatusChange?: (accountId: string, newStatus: string) => void;
  recentlyMovedAccounts?: Set<string>;
  paginationData?: any;
  currentPage?: number;
  onPageChange?: (page: number) => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  isExplorationMode?: boolean;
}) {
  return (
    <div className="flex flex-col transition-all duration-200 w-full min-w-0 bg-white">
      {/* Sticky Header */}
      <div className={cn(
        "border-b transition-all duration-200 shadow-sm sticky top-0 z-10 bg-white",
        id === "original" && "bg-gradient-to-r from-blue-50 to-blue-100 border-blue-200",
        id === "must_keep" && "bg-gradient-to-r from-green-50 to-emerald-50 border-green-200",
        id === "for_discussion" && "bg-gradient-to-r from-yellow-50 to-amber-50 border-yellow-200",
        id === "to_be_peeled" && "bg-gradient-to-r from-red-50 to-rose-50 border-red-200",
        id === "available" && "bg-gradient-to-r from-slate-50 to-slate-100 border-slate-200"
      )}>
        {/* Header with title and count */}
        <div className="p-4 flex items-center gap-3 w-full">
          <div className={cn(
            "w-3 h-3 rounded-full flex-shrink-0 shadow-sm",
            id === "original" && "bg-blue-500",
            id === "must_keep" && "bg-green-500",
            id === "for_discussion" && "bg-yellow-500",
            id === "to_be_peeled" && "bg-red-500",
            id === "available" && "bg-slate-400"
          )}></div>
          <div className="flex-1 min-w-0 overflow-hidden">
            <h3 className="font-bold text-sm text-slate-900 line-clamp-2" title={title}>{title}</h3>
            <p className="text-xs text-slate-600 mt-1">
              {searchQuery ? `${totalCount || 0} matching accounts` : `${totalCount || 0} accounts`}
            </p>
          </div>
        </div>
        
        {/* Search input for Available Accounts */}
        {id === "available" && onSearchChange && (
          <div className="px-4 pb-4">
            <div className="relative">
              <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
                <Search className="h-4 w-4 text-slate-400" />
              </div>
              <Input
                type="text"
                placeholder="Search available accounts..."
                value={searchQuery || ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => onSearchChange(e.target.value)}
                className="pl-10 h-9 text-sm border-slate-200 focus:border-blue-400 focus:ring-blue-400 rounded-lg shadow-sm"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onSearchChange('')}
                  className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0"
                >
                  ×
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
      
      {/* Content Area - No individual scrolling */}
      <div className="flex-1">
        <div className={cn(
          "p-3 transition-all duration-200 w-full max-w-full min-w-0",
          isExplorationMode ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" : "space-y-3"
        )}>
          {accounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500 col-span-full">
              <div className="p-3 bg-slate-100 rounded-full mb-3">
                <Building2 className="h-6 w-6 opacity-60" />
              </div>
              <p className="text-sm font-medium text-center text-slate-600">{emptyMessage}</p>
              <p className="text-xs text-slate-400 mt-1">No accounts to display</p>
            </div>
          ) : (
            <>
              {accounts.map(account => (
                <AccountCard 
                  key={`${id}-${account.id}-${account.status || 'original'}`} 
                  account={account} 
                  isReadOnly={isReadOnly}
                  userRole={userRole}
                  onStatusChange={onStatusChange}
                  isRecentlyMoved={recentlyMovedAccounts?.has(account.id) || false}
                  isExplorationMode={isExplorationMode}
                />
              ))}
            </>
          )}
        </div>
      </div>
      
      {/* Sticky Pagination Controls */}
      {paginationData && (
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex-shrink-0 sticky bottom-0 z-10">
          <div className="flex flex-col gap-2">
            {/* Results info - only show if there are accounts */}
            {paginationData && paginationData.totalCount > 0 && (
              <div className="text-xs text-slate-600 text-center">
                {`${((currentPage || 1) - 1) * 25 + 1}-${Math.min((currentPage || 1) * 25, paginationData.totalCount)} of ${paginationData.totalCount}`}
              </div>
            )}
            
            {/* Pagination buttons - only show if multiple pages */}
            {paginationData.totalPages > 1 && (
              <div className="flex items-center justify-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onPageChange?.(Math.max(1, (currentPage || 1) - 1))}
                  disabled={currentPage === 1}
                  className="px-2 py-1 h-7 text-xs"
                >
                  ←
                </Button>
                
                {/* Page numbers - compact for column width */}
                {Array.from({ length: Math.min(3, paginationData.totalPages) }, (_, i) => {
                  let pageNum;
                  if (paginationData.totalPages <= 3) {
                    pageNum = i + 1;
                  } else if ((currentPage || 1) <= 2) {
                    pageNum = i + 1;
                  } else if ((currentPage || 1) >= paginationData.totalPages - 1) {
                    pageNum = paginationData.totalPages - 2 + i;
                  } else {
                    pageNum = (currentPage || 1) - 1 + i;
                  }
                  
                  if (pageNum > paginationData.totalPages) return null;
                  
                  return (
                    <Button
                      key={pageNum}
                      variant={pageNum === currentPage ? "default" : "outline"}
                      size="sm"
                      onClick={() => onPageChange?.(pageNum)}
                      className="w-7 h-7 p-0 text-xs"
                    >
                      {pageNum}
                    </Button>
                  );
                })}
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onPageChange?.(Math.min(paginationData.totalPages, (currentPage || 1) + 1))}
                  disabled={currentPage === paginationData.totalPages}
                  className="px-2 py-1 h-7 text-xs"
                >
                  →
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

const AccountTable = ({ 
  id, 
  title, 
  accounts, 
  totalCount,
  emptyMessage,
  isReadOnly,
  userRole,
  onStatusChange,
  recentlyMovedAccounts,
  paginationData,
  currentPage,
  onPageChange,
  searchQuery,
  onSearchChange,
  isExplorationMode = false,
}: { 
  id: string;
  title: string;
  accounts: Account[];
  totalCount?: number;
  emptyMessage: string;
  isReadOnly?: boolean;
  userRole?: string;
  onStatusChange?: (accountId: string, newStatus: string) => void;
  recentlyMovedAccounts?: Set<string>;
  paginationData?: any;
  currentPage?: number;
  onPageChange?: (page: number) => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  isExplorationMode?: boolean;
}) => {
  // Format revenue helper
  const formatRevenue = (revenue: number) => {
    if (revenue >= 1_000_000) {
      return `$${(revenue / 1_000_000).toFixed(1)}M`;
    } else if (revenue >= 1_000) {
      return `$${(revenue / 1_000).toFixed(0)}K`;
    } else {
      return `$${revenue.toFixed(0)}`;
    }
  };

  // Check if account is assigned to another seller
  const isAssignedToOther = (account: Account) => 
    account.assignment_status && account.assignment_status !== 'available' && account.assignment_status !== account.status;

  // Get assignment status for display
  const getAssignmentStatus = (account: Account) => {
    if (account.assignment_status === 'available') return null;
    if (account.assignment_status === account.status) return null; // Same seller
    return account.assignment_status;
  };

  return (
    <div className="h-full flex flex-col transition-all duration-200 w-full overflow-hidden min-w-0">
      <div className={cn(
        "border-b transition-all duration-200 shadow-sm",
        id === "original" && "bg-gradient-to-r from-blue-50 to-blue-100 border-blue-200",
        id === "must_keep" && "bg-gradient-to-r from-emerald-50 to-green-100 border-emerald-200",
        id === "for_discussion" && "bg-gradient-to-r from-amber-50 to-yellow-100 border-amber-200",
        id === "to_be_peeled" && "bg-gradient-to-r from-red-50 to-rose-100 border-red-200",
        id === "available" && "bg-gradient-to-r from-slate-50 to-slate-100 border-slate-200"
      )}>
        <div className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/80 rounded-lg shadow-sm border border-white/60">
                <Building2 className="h-5 w-5 text-slate-700" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">{title}</h3>
                <p className="text-sm text-slate-600">
                  {totalCount || 0} accounts
                </p>
              </div>
            </div>
            
            {/* Search and Filters */}
            <div className="flex items-center gap-3">
              {onSearchChange && (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search accounts..."
                    value={searchQuery || ""}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className="pl-10 w-64"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {accounts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500">
            <div className="p-4 bg-slate-100 rounded-full mb-4">
              <Building2 className="h-8 w-8 opacity-60" />
            </div>
            <p className="text-sm font-medium text-center text-slate-600">{emptyMessage}</p>
            <p className="text-xs text-slate-400 mt-1">No accounts to display</p>
          </div>
        ) : (
          <div className="overflow-auto h-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Account</TableHead>
                  <TableHead className="w-[100px]">Division</TableHead>
                  <TableHead className="w-[100px]">Revenue</TableHead>
                  <TableHead className="w-[100px]">Size</TableHead>
                  <TableHead className="w-[100px]">Tier</TableHead>
                  <TableHead className="w-[120px]">Location</TableHead>
                  <TableHead className="w-[150px]">Industry</TableHead>
                  <TableHead className="w-[100px]">Match %</TableHead>
                  <TableHead className="w-[120px]">Assignment</TableHead>
                  <TableHead className="w-[120px]">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => {
                  const totalRevenue = account.revenue_breakdown.esg + account.revenue_breakdown.gdt + 
                                    account.revenue_breakdown.gvc + account.revenue_breakdown.msg_us;
                  const isAssigned = isAssignedToOther(account);
                  const assignmentStatus = getAssignmentStatus(account);
                  const isRecentlyMoved = recentlyMovedAccounts?.has(account.id) || false;
                  
                  return (
                    <TableRow 
                      key={`${id}-${account.id}-${account.status || 'original'}`}
                      className={cn(
                        "transition-all duration-200",
                        isAssigned && "bg-slate-100/80 opacity-75",
                        isRecentlyMoved && "ring-2 ring-blue-400 ring-opacity-60 bg-blue-50/30",
                        !isReadOnly && !isAssigned && "hover:bg-slate-50 cursor-pointer"
                      )}
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div className="p-1 bg-slate-100 rounded">
                            <Building2 className="h-3 w-3 text-slate-700" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-sm truncate" title={account.name}>
                              {account.name}
                            </div>
                            {account.city && (
                              <div className="text-xs text-slate-500">{account.city}</div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {account.current_division}
                        </Badge>
                      </TableCell>
                      
                      <TableCell>
                        <div className="text-sm font-semibold">
                          {formatRevenue(totalRevenue)}
                        </div>
                      </TableCell>
                      
                      <TableCell>
                        {account.size && (
                          <span className="text-sm capitalize">{account.size}</span>
                        )}
                      </TableCell>
                      
                      <TableCell>
                        {account.tier && (
                          <span className="text-sm">{account.tier}</span>
                        )}
                      </TableCell>
                      
                      <TableCell>
                        <div className="text-sm">
                          {account.state && (
                            <div>{account.state}</div>
                          )}
                          {!account.state && account.country && (
                            <div>{account.country}</div>
                          )}
                        </div>
                      </TableCell>
                      
                      <TableCell>
                        {account.industry && (
                          <div className="text-sm truncate max-w-[140px]" title={account.industry}>
                            {account.industry}
                          </div>
                        )}
                      </TableCell>
                      
                      <TableCell>
                        {account.fit_percentage !== undefined && (
                          <div className={cn(
                            "text-sm font-semibold px-2 py-1 rounded",
                            account.fit_percentage >= 80 && "bg-emerald-100 text-emerald-800",
                            account.fit_percentage >= 60 && account.fit_percentage < 80 && "bg-amber-100 text-amber-800",
                            account.fit_percentage < 60 && "bg-red-100 text-red-800"
                          )}>
                            {account.fit_percentage}%
                          </div>
                        )}
                      </TableCell>
                      
                      <TableCell>
                        {isAssigned && account.assigned_seller_name ? (
                          <div className="flex items-center gap-1 text-sm text-orange-700">
                            <LockIcon className="h-3 w-3" />
                            <span className="truncate max-w-[100px]" title={account.assigned_seller_name}>
                              {account.assigned_seller_name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-sm text-slate-500">Available</span>
                        )}
                      </TableCell>
                      
                      <TableCell>
                        {!isReadOnly && onStatusChange && userRole && !isAssigned ? (
                          <Select
                            value={account.status || "available"}
                            onValueChange={(newStatus) => onStatusChange(account.id, newStatus)}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="must_keep">Must Keep</SelectItem>
                              <SelectItem value="for_discussion">For Discussion</SelectItem>
                              <SelectItem value="to_be_peeled">To be Peeled</SelectItem>
                              <SelectItem value="available">Available</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge 
                            variant={account.status === 'must_keep' ? 'default' : 'secondary'}
                            className="text-xs"
                          >
                            {account.status || 'available'}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
      
      {/* Enhanced Pagination Controls */}
      {paginationData && (
        <div className="p-3 bg-white border-t border-slate-200">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>
                Showing {((currentPage || 1) - 1) * (paginationData.limit || 50) + 1} to{' '}
                {Math.min((currentPage || 1) * (paginationData.limit || 50), paginationData.totalCount || 0)} of{' '}
                {paginationData.totalCount || 0} accounts
              </span>
              <div className="flex items-center gap-2">
                {/* First Page */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onPageChange?.(1)}
                  disabled={!currentPage || currentPage <= 1}
                  className="px-2"
                >
                  «
                </Button>
                
                {/* Previous Page */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onPageChange?.((currentPage || 1) - 1)}
                  disabled={!currentPage || currentPage <= 1}
                >
                  Previous
                </Button>
                
                {/* Page Numbers */}
                {(() => {
                  const totalPages = paginationData.totalPages || 1;
                  const current = currentPage || 1;
                  const pages = [];
                  
                  // Calculate which page numbers to show
                  let startPage = Math.max(1, current - 2);
                  let endPage = Math.min(totalPages, current + 2);
                  
                  // Adjust if we're near the beginning or end
                  if (current <= 3) {
                    endPage = Math.min(5, totalPages);
                  }
                  if (current >= totalPages - 2) {
                    startPage = Math.max(1, totalPages - 4);
                  }
                  
                  // Add first page and ellipsis if needed
                  if (startPage > 1) {
                    pages.push(
                      <Button
                        key={1}
                        variant={current === 1 ? "default" : "outline"}
                        size="sm"
                        onClick={() => onPageChange?.(1)}
                        className="px-3"
                      >
                        1
                      </Button>
                    );
                    if (startPage > 2) {
                      pages.push(
                        <span key="ellipsis1" className="px-2 text-slate-400">
                          ...
                        </span>
                      );
                    }
                  }
                  
                  // Add page numbers
                  for (let i = startPage; i <= endPage; i++) {
                    pages.push(
                      <Button
                        key={i}
                        variant={current === i ? "default" : "outline"}
                        size="sm"
                        onClick={() => onPageChange?.(i)}
                        className="px-3"
                      >
                        {i}
                      </Button>
                    );
                  }
                  
                  // Add last page and ellipsis if needed
                  if (endPage < totalPages) {
                    if (endPage < totalPages - 1) {
                      pages.push(
                        <span key="ellipsis2" className="px-2 text-slate-400">
                          ...
                        </span>
                      );
                    }
                    pages.push(
                      <Button
                        key={totalPages}
                        variant={current === totalPages ? "default" : "outline"}
                        size="sm"
                        onClick={() => onPageChange?.(totalPages)}
                        className="px-3"
                      >
                        {totalPages}
                      </Button>
                    );
                  }
                  
                  return pages;
                })()}
                
                {/* Next Page */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onPageChange?.((currentPage || 1) + 1)}
                  disabled={!currentPage || currentPage >= (paginationData.totalPages || 1)}
                >
                  Next
                </Button>
                
                {/* Last Page */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onPageChange?.(paginationData.totalPages || 1)}
                  disabled={!currentPage || currentPage >= (paginationData.totalPages || 1)}
                  className="px-2"
                >
                  »
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const AccountCard = memo(function AccountCard({ 
  account, 
  isReadOnly,
  userRole,
  onStatusChange,
  isRecentlyMoved = false,
  isExplorationMode = false,
}: { 
  account: Account; 
  isReadOnly?: boolean;
  userRole?: string;
  onStatusChange?: (accountId: string, newStatus: string) => void;
  isRecentlyMoved?: boolean;
  isExplorationMode?: boolean;
}) {
  // Memoize expensive calculations
  const formattedRevenue = useMemo(() => {
    const total = account.revenue_breakdown.esg + account.revenue_breakdown.gdt + 
                  account.revenue_breakdown.gvc + account.revenue_breakdown.msg_us;
    if (total >= 1_000_000) {
      return `$${(total / 1_000_000).toFixed(1)}M`;
    } else if (total >= 1_000) {
      return `$${(total / 1_000).toFixed(0)}K`;
    } else {
      return `$${total.toFixed(0)}`;
    }
  }, [account.revenue_breakdown]);

  const isMustKeep = useMemo(() => 
    account.status === 'must_keep' || account.status === 'pinned' || account.status === 'approval_for_pinning',
    [account.status]
  );

  // NEW: Check if account is assigned to another seller
  const isAssignedToOther = useMemo(() => 
    account.assignment_status && account.assignment_status !== 'available' && account.assignment_status !== account.status,
    [account.assignment_status, account.status]
  );

  // NEW: Get assignment status for display
  const assignmentStatus = useMemo(() => {
    if (account.assignment_status === 'available') return null;
    if (account.assignment_status === account.status) return null; // Same seller
    return account.assignment_status;
  }, [account.assignment_status, account.status]);

  // Memoize the status change handler
  const handleStatusChangeCallback = useCallback((newStatus: string) => {
    if (onStatusChange) {
      onStatusChange(account.id, newStatus);
    }
  }, [account.id, onStatusChange]);
  
  return (
    <Card className={cn(
      "transition-all duration-200 relative border-0 group overflow-hidden w-full max-w-full",
      isExplorationMode ? "h-[280px]" : "h-[400px]", // Increased height to show all content
      // NEW: Visual indicators for assigned accounts
      isAssignedToOther ? "bg-slate-100/80 opacity-75 border-slate-300" : "bg-white",
      !isReadOnly && !isAssignedToOther && "hover:shadow-lg hover:shadow-slate-300/30 hover:-translate-y-0.5 hover:scale-[1.01] cursor-pointer",
      isReadOnly && "bg-slate-50/95",
      isRecentlyMoved && "ring-2 ring-blue-400 ring-opacity-60 bg-blue-50/30",
      "shadow-md shadow-slate-300/20 border border-slate-200/50"
    )} style={{ width: '100%', minWidth: 0, maxWidth: '100%', boxSizing: 'border-box', pointerEvents: isAssignedToOther ? 'none' : 'auto' }}>
      <CardContent className="p-0 overflow-hidden h-full flex flex-col">
        {/* Clean Header */}
        <div className="relative bg-white p-3 border-b border-slate-200">
          {/* Status Indicators */}
          <div className="absolute top-2 right-2 flex gap-1">
            {isMustKeep && (
              <div className="p-1 bg-emerald-100 rounded-full">
                <Shield className="h-3 w-3 text-emerald-600" />
              </div>
            )}
            {isAssignedToOther && (
              <div className="p-1 bg-orange-100 rounded-full">
                <LockIcon className="h-3 w-3 text-orange-600" />
              </div>
            )}
            {isRecentlyMoved && (
              <div className="p-1 bg-blue-100 rounded-full animate-pulse">
                <div className="h-3 w-3 bg-blue-600 rounded-full"></div>
              </div>
            )}
          </div>
          
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 bg-slate-100 rounded-lg">
                  <Building2 className="h-4 w-4 text-slate-600" />
                </div>
                <h4 className="font-bold text-sm text-slate-900 leading-tight line-clamp-2 group-hover:text-slate-800 transition-colors" title={account.name}>
                  {account.name}
                </h4>
              </div>
            </div>
            
            {/* Division and Match Badges */}
            <div className="flex flex-col items-end gap-1.5">
              <Badge 
                variant="outline" 
                className="text-xs font-semibold bg-slate-50 border-slate-300 text-slate-700 px-2 py-1 rounded-md"
              >
                {account.current_division}
              </Badge>
              
              {/* Match Badge */}
              {account.fit_percentage !== undefined && (
                <div className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold",
                  account.fit_percentage >= 80 && "bg-emerald-50 text-emerald-700 border border-emerald-200",
                  account.fit_percentage >= 60 && account.fit_percentage < 80 && "bg-amber-50 text-amber-700 border border-amber-200",
                  account.fit_percentage < 60 && "bg-red-50 text-red-700 border border-red-200"
                )}>
                  <span>Match:</span>
                  <span className="font-bold">{account.fit_percentage}%</span>
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Simplified Account Details - Essential info only */}
        <div className="p-3 space-y-2 w-full overflow-hidden flex-1">
          {/* Key Information Only */}
          <div className="space-y-2">
            {/* Revenue - Most Important */}
            <div className="flex items-center justify-between px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-md">
              <span className="text-xs font-semibold text-slate-600">Revenue</span>
              <span className="text-sm font-bold text-slate-900">{formattedRevenue}</span>
            </div>
            
            {/* Size and Tier in one row */}
            <div className="flex gap-1">
              {account.size && (
                <div className="flex-1 px-2 py-1 bg-slate-50 border border-slate-200 rounded-md text-center">
                  <span className="text-xs font-semibold text-slate-600 block">Size</span>
                  <span className="text-xs font-bold text-slate-800 capitalize">{account.size}</span>
                </div>
              )}
              {account.tier && (
                <div className="flex-1 px-2 py-1 bg-slate-50 border border-slate-200 rounded-md text-center">
                  <span className="text-xs font-semibold text-slate-600 block">Tier</span>
                  <span className="text-xs font-bold text-slate-800">{account.tier}</span>
                </div>
              )}
            </div>
            
            {/* Location */}
            {(account.state || account.country) && (
              <div className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-md">
                <span className="text-xs font-semibold text-slate-600 block">Location</span>
                <span className="text-xs font-bold text-slate-800">{account.state || account.country}</span>
              </div>
            )}
            
            {/* Industry */}
            {account.industry && (
              <div className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-md" title={account.industry}>
                <span className="text-xs font-semibold text-slate-600 block">Industry</span>
                <span className="text-xs font-bold text-slate-800 truncate">{account.industry}</span>
              </div>
            )}
            
            {/* Assigned to Other Seller */}
            {isAssignedToOther && account.assigned_seller_name && (
              <div className="flex items-center gap-1 px-2 py-1.5 bg-orange-50 border border-orange-200 rounded-md">
                <LockIcon className="h-3 w-3 text-orange-600" />
                <span className="text-xs font-semibold text-orange-700">Assigned to:</span>
                <span className="text-xs font-bold text-orange-800 truncate">{account.assigned_seller_name}</span>
              </div>
            )}
          </div>
        </div>

        {/* Compact Status Change Section */}
        {!isReadOnly && onStatusChange && userRole && !isAssignedToOther && (
          <div className="px-3 pb-2 mt-auto border-t border-slate-200 pt-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 block">Status</label>
              <Select
                value={account.status || "available"}
                onValueChange={handleStatusChangeCallback}
              >
                <SelectTrigger className="h-7 text-xs border-slate-300 focus:border-blue-400 focus:ring-blue-400 rounded-md bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="must_keep">Must Keep</SelectItem>
                  <SelectItem value="for_discussion">For Discussion</SelectItem>
                  <SelectItem value="to_be_peeled">To be Peeled</SelectItem>
                  <SelectItem value="available">Available</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Assigned Account Message */}
        {isAssignedToOther && (
          <div className="px-3 pb-2 mt-auto border-t border-slate-200 pt-2">
            <div className="flex items-center gap-1.5 px-2 py-1 bg-orange-50 border border-orange-200 rounded-md">
              <LockIcon className="h-3 w-3 text-orange-600" />
              <span className="text-xs font-semibold text-orange-800">Assigned to another seller</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
});
