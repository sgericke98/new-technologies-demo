'use client'

import { useAuth } from "@/contexts/AuthContext";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Users, DollarSign, Briefcase, TrendingUp, Star } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DivisionBadge } from "@/components/dashboard/DivisionBadge";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useAudit } from "@/hooks/use-audit";
import { PageLoader, DataLoader } from "@/components/ui/loader";
// Import functionality moved to Settings page

export default function DashboardPage() {
  const { profile, user, loading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { logEvent } = useAudit();
  const router = useRouter();

  // Redirect if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      router.push("/auth");
    }
  }, [user, loading, router]);
  // Import functionality moved to Settings page
  const [searchQuery, setSearchQuery] = useState("");
  const [finalizedSellers, setFinalizedSellers] = useState<Set<string>>(new Set());
  
  // Account thresholds are now handled by size-seniority based settings
  
  // Revenue range settings by size and seniority
  const [revenueRangeSettings, setRevenueRangeSettings] = useState({
    midmarketJunior: { min_revenue: 1_000_000, max_revenue: 5_000_000 },
    midmarketSenior: { min_revenue: 2_000_000, max_revenue: 8_000_000 },
    enterpriseJunior: { min_revenue: 3_000_000, max_revenue: 10_000_000 },
    enterpriseSenior: { min_revenue: 5_000_000, max_revenue: 20_000_000 },
  });
  
  // Account number settings by size and seniority
  const [accountNumberSettings, setAccountNumberSettings] = useState({
    midmarketJunior: { max_accounts: 3 },
    midmarketSenior: { max_accounts: 5 },
    enterpriseJunior: { max_accounts: 4 },
    enterpriseSenior: { max_accounts: 7 },
  });
  
  // Filter states
  const [showRevenueHealthy, setShowRevenueHealthy] = useState(true);
  const [showRevenueUnhealthy, setShowRevenueUnhealthy] = useState(true);
  const [showAccountHealthy, setShowAccountHealthy] = useState(true);
  const [showAccountUnhealthy, setShowAccountUnhealthy] = useState(true);
  
  // Seniority filter states
  const [showJunior, setShowJunior] = useState(true);
  const [showSenior, setShowSenior] = useState(true);
  
  // Division filter states
  const [showESG, setShowESG] = useState(true);
  const [showGDT, setShowGDT] = useState(true);
  const [showGVC, setShowGVC] = useState(true);
  const [showMSG, setShowMSG] = useState(true);
  const [showMIXED, setShowMIXED] = useState(true);
  
  // Completion status filter states
  const [showCompleted, setShowCompleted] = useState(true);
  const [showNotCompleted, setShowNotCompleted] = useState(true);

  // File input refs moved to Settings page

  // Fetch threshold settings and revenue range settings
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        // Account threshold is now handled by size-seniority based settings

        // Fetch revenue range settings
        const { data: revenueRangeData, error: revenueRangeError } = await supabase
          .from('revenue_range_settings')
          .select('*')
          .order('size_type, seniority_type');

        if (revenueRangeError) {
          console.error('Error fetching revenue range settings:', revenueRangeError);
        } else if (revenueRangeData) {
          const newSettings = {
            midmarketJunior: { min_revenue: 1_000_000, max_revenue: 5_000_000 },
            midmarketSenior: { min_revenue: 2_000_000, max_revenue: 8_000_000 },
            enterpriseJunior: { min_revenue: 3_000_000, max_revenue: 10_000_000 },
            enterpriseSenior: { min_revenue: 5_000_000, max_revenue: 20_000_000 },
          };

          // Update with fetched data
          revenueRangeData.forEach((item) => {
            const key = `${item.size_type}${item.seniority_type.charAt(0).toUpperCase() + item.seniority_type.slice(1)}` as keyof typeof newSettings;
            if (newSettings[key]) {
              newSettings[key] = {
                min_revenue: item.min_revenue,
                max_revenue: item.max_revenue,
              };
            }
          });

          setRevenueRangeSettings(newSettings);
        }

        // Fetch account number settings
        const { data: accountNumberData, error: accountNumberError } = await supabase
          .from('account_number_settings')
          .select('*')
          .order('size_type, seniority_type');

        if (accountNumberError) {
          console.error('Error fetching account number settings:', accountNumberError);
        } else if (accountNumberData) {
          const newAccountNumberSettings = {
            midmarketJunior: { max_accounts: 3 },
            midmarketSenior: { max_accounts: 5 },
            enterpriseJunior: { max_accounts: 4 },
            enterpriseSenior: { max_accounts: 7 },
          };

          // Update with fetched data
          accountNumberData.forEach((item) => {
            const key = `${item.size_type}${item.seniority_type.charAt(0).toUpperCase() + item.seniority_type.slice(1)}` as keyof typeof newAccountNumberSettings;
            if (newAccountNumberSettings[key]) {
              newAccountNumberSettings[key] = {
                max_accounts: item.max_accounts,
              };
            }
          });

          setAccountNumberSettings(newAccountNumberSettings);
        }
      } catch (error) {
        console.error('Error fetching settings:', error);
      }
    };

    fetchSettings();
  }, []);

  // Fetch sellers (manager-scoped for MANAGER role)
  const { data: sellers = [], isLoading: sellersLoading } = useQuery({
    queryKey: ["sellers", profile?.role, profile?.id],
    queryFn: async () => {
      if (profile?.role === "MANAGER") {
        // Get manager IDs for current user
        const { data: managerData } = await supabase
          .from("managers")
          .select("id")
          .eq("user_id", profile.id);

        const managerIds = managerData?.map((m) => m.id) ?? [];

        if (managerIds.length === 0) {
          return [];
        }

        // Fetch only sellers assigned to this manager
        const { data, error } = await supabase
          .from("sellers")
          .select(`
            *,
            manager:managers(name, user_id)
          `)
          .in("manager_id", managerIds)
          .order("name");

        if (error) throw error;
        return data || [];
      } else {
        // MASTER can see all sellers
        const { data, error } = await supabase
          .from("sellers")
          .select(`
            *,
            manager:managers(name, user_id)
          `)
          .order("name");

        if (error) throw error;
        return data || [];
      }
    },
  });

  // Fetch accounts with pagination
  const { data: accounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const allRecords: any[] = [];
      let from = 0;
      const limit = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from("accounts")
          .select("*")
          .order("name")
          .range(from, from + limit - 1);

        if (error) throw error;
        
        if (data && data.length > 0) {
          allRecords.push(...data);
          from += limit;
          hasMore = data.length === limit;
        } else {
          hasMore = false;
        }
      }

      return allRecords;
    },
  });

  // Fetch relationship maps for revenue calculations (only must_keep status) with pagination
  const { data: relationships = [], isLoading: relationshipsLoading } = useQuery({
    queryKey: ["relationship_maps"],
    queryFn: async () => {
      const allRecords: any[] = [];
      let from = 0;
      const limit = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from("relationship_maps")
          .select(`
            *,
            account:accounts!inner(*, revenue:account_revenues!inner(*))
          `)
          .eq("status", "must_keep")
          .range(from, from + limit - 1);

        if (error) throw error;
        
        if (data && data.length > 0) {
          allRecords.push(...data);
          from += limit;
          hasMore = data.length === limit;
        } else {
          hasMore = false;
        }
      }

      return allRecords;
    },
  });

  // Fetch accounts with revenue for accurate KPIs with pagination
  const { data: accountsWithRevenue = [], isLoading: accountsWithRevenueLoading } = useQuery({
    queryKey: ["accounts-with-revenue"],
    queryFn: async () => {
      const allRecords: any[] = [];
      let from = 0;
      const limit = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from("accounts")
          .select("*, revenue:account_revenues!inner(*)")
          .range(from, from + limit - 1);

        if (error) throw error;
        
        if (data && data.length > 0) {
          allRecords.push(...data);
          from += limit;
          hasMore = data.length === limit;
        } else {
          hasMore = false;
        }
      }

      return allRecords;
    },
  });


  // Fetch managers with their sellers for team composition with pagination
  const { data: managers = [], isLoading: managersLoading } = useQuery({
    queryKey: ["managers"],
    queryFn: async () => {
      const allRecords: any[] = [];
      let from = 0;
      const limit = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from("managers")
          .select(`
            *,
            sellers:sellers(id, name, division, size)
          `)
          .range(from, from + limit - 1);

        if (error) throw error;
        
        if (data && data.length > 0) {
          allRecords.push(...data);
          from += limit;
          hasMore = data.length === limit;
        } else {
          hasMore = false;
        }
      }

      return allRecords;
    },
  });


  // Import handler moved to Settings page

  // Fetch seller revenues from centralized view with pagination
  const { data: revenueData = [], isLoading: revenueDataLoading } = useQuery({
    queryKey: ["sellerRevenue"],
    queryFn: async () => {
      const allRecords: any[] = [];
      let from = 0;
      const limit = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from("seller_revenue_view")
          .select("seller_id, seller_total_revenue")
          .range(from, from + limit - 1);

        if (error) throw error;
        
        if (data && data.length > 0) {
          allRecords.push(...data);
          from += limit;
          hasMore = data.length === limit;
        } else {
          hasMore = false;
        }
      }

      return allRecords;
    },
  });

  const revenueMap = new Map<string, number>(
    revenueData
      .filter(r => r.seller_id) // Filter out null seller_ids
      .map(r => [r.seller_id!, Number(r.seller_total_revenue) || 0])
  );

  // Calculate seller account counts and health indicators
  const sellerRevenues = sellers.map(seller => {
    const sellerRelationships = relationships.filter(
      r => r.seller_id === seller.id
    );

    // Calculate weighted revenue for this seller using the same logic as other tabs
    const totalRevenue = sellerRelationships.reduce((sum, rel) => {
      const account = rel.account;
      if (!account || !account.revenue) return sum;
      
      const revenueRow = Array.isArray(account.revenue) ? account.revenue[0] : account.revenue;
      if (!revenueRow) return sum;
      
      // Simple sum of all division revenues (no percentage weights)
      const totalAccountRevenue = 
        (revenueRow.revenue_esg || 0) +
        (revenueRow.revenue_gdt || 0) +
        (revenueRow.revenue_gvc || 0) +
        (revenueRow.revenue_msg_us || 0);
      
      return sum + totalAccountRevenue;
    }, 0);
    
    const accountCount = sellerRelationships?.length || 0;
    
    // Check for size mismatches between seller and their assigned accounts
    const enterpriseAccounts = (sellerRelationships || []).filter(rel => {
      const account = rel.account;
      return account && account.size === 'enterprise';
    });
    
    const midmarketAccounts = (sellerRelationships || []).filter(rel => {
      const account = rel.account;
      return account && account.size === 'midmarket';
    });
    
    // Determine mismatch type and count
    let mismatchType = '';
    let mismatchedAccountCount = 0;
    
    if (seller.size === 'enterprise' && midmarketAccounts.length > 0) {
      mismatchType = 'MIDMARKET ACCOUNTS';
      mismatchedAccountCount = midmarketAccounts.length;
    } else if (seller.size === 'midmarket' && enterpriseAccounts.length > 0) {
      mismatchType = 'ENTERPRISE ACCOUNTS';
      mismatchedAccountCount = enterpriseAccounts.length;
    }
    
    const hasSizeMismatch = mismatchedAccountCount > 0;
    
    // Check for industry mismatches between seller and their assigned accounts
    const industryMismatchedAccounts = (sellerRelationships || []).filter(rel => {
      const account = rel.account;
      if (!account || !seller.industry_specialty || seller.industry_specialty === '-') return false;
      
      // Check if account industry doesn't match seller's industry specialization
      return account.industry && account.industry !== seller.industry_specialty;
    });
    
    const hasIndustryMismatch = industryMismatchedAccounts.length > 0;
    const industryMismatchedAccountCount = industryMismatchedAccounts.length;
    
    // Calculate health indicators using size and seniority-based revenue ranges
    const isSenior = (seller.tenure_months || 0) > 12;
    const seniorityType = isSenior ? 'Senior' : 'Junior';
    const sizeType = seller.size;
    
    // Get the appropriate revenue range for this seller's size and seniority
    const rangeKey = `${sizeType}${seniorityType}` as keyof typeof revenueRangeSettings;
    const revenueRange = revenueRangeSettings[rangeKey];
    
    const isRevenueHealthy = revenueRange 
      ? totalRevenue >= revenueRange.min_revenue && totalRevenue <= revenueRange.max_revenue
      : false; // Default to unhealthy if no range is found
    
    // Get the appropriate account threshold for this seller's size and seniority
    const accountRangeKey = `${sizeType}${seniorityType}` as keyof typeof accountNumberSettings;
    const accountRange = accountNumberSettings[accountRangeKey];
    
    const isAccountCountHealthy = accountRange 
      ? accountCount <= accountRange.max_accounts
      : true; // Default to healthy if no specific range is configured

    return {
      ...seller,
      accountCount,
      totalRevenue,
      isRevenueHealthy,
      isAccountCountHealthy,
      hasSizeMismatch,
      mismatchedAccountCount,
      mismatchType,
      hasIndustryMismatch,
      industryMismatchedAccountCount,
    };
  });

  // Filter sellers based on search query and all filters
  const filteredSellers = sellerRevenues.filter(seller => {
    // Text search filter
    const matchesSearch = seller.name.toLowerCase().includes(searchQuery.toLowerCase());
    
    // Health indicator filters
    const matchesRevenueFilter = 
      (showRevenueHealthy && seller.isRevenueHealthy) || 
      (showRevenueUnhealthy && !seller.isRevenueHealthy);
    
    const matchesAccountFilter = 
      (showAccountHealthy && seller.isAccountCountHealthy) || 
      (showAccountUnhealthy && !seller.isAccountCountHealthy);
    
    // Seniority filter
    const isSenior = (seller.tenure_months || 0) > 12;
    const matchesSeniorityFilter = 
      (showJunior && !isSenior) || 
      (showSenior && isSenior);
    
    // Division filter
    const matchesDivisionFilter = 
      (showESG && seller.division === 'ESG') ||
      (showGDT && seller.division === 'GDT') ||
      (showGVC && seller.division === 'GVC') ||
      (showMSG && seller.division === 'MSG_US') ||
      (showMIXED && seller.division === 'MIXED');
    
    // Completion status filter
    const isCompleted = seller.book_finalized === true;
    const matchesCompletionFilter = 
      (showCompleted && isCompleted) || 
      (showNotCompleted && !isCompleted);
    
    return matchesSearch && matchesRevenueFilter && matchesAccountFilter && matchesSeniorityFilter && matchesDivisionFilter && matchesCompletionFilter;
  });

  // Calculate KPIs by size using filtered sellers
  const calculateKPIs = (size: "enterprise" | "midmarket") => {
    const sizeSellers = filteredSellers.filter(s => s.size === size);
    const sizeSellerIds = sizeSellers.map(s => s.id);
    
    // Get relationships for sellers of this size
    const sizeRelationships = relationships.filter(
      r => sizeSellerIds.includes(r.seller_id)
    );
    
    // Calculate total revenue for this size (simple sum of all division revenues)
    const totalRevenue = sizeRelationships.reduce((sum, rel) => {
      const account = rel.account;
      if (!account || !account.revenue) return sum;
      
      const revenueRow = Array.isArray(account.revenue) ? account.revenue[0] : account.revenue;
      if (!revenueRow) return sum;
      
      // Simple sum of all division revenues (no percentage weights)
      const totalAccountRevenue = 
        (revenueRow.revenue_esg || 0) +
        (revenueRow.revenue_gdt || 0) +
        (revenueRow.revenue_gvc || 0) +
        (revenueRow.revenue_msg_us || 0);
      
      return sum + totalAccountRevenue;
    }, 0);

    // Get unique accounts for this size
    const uniqueAccounts = Array.from(new Set(sizeRelationships.map(rel => rel.account?.id).filter(Boolean)));
    
    const avgRevenue = uniqueAccounts.length > 0 
      ? totalRevenue / uniqueAccounts.length 
      : 0;

    return {
      accountCount: uniqueAccounts.length || 0,
      sellerCount: sizeSellers.length || 0,
      totalRevenue: totalRevenue || 0,
      avgRevenue: avgRevenue || 0,
    };
  };

  const enterpriseKPIs = calculateKPIs("enterprise");
  const midmarketKPIs = calculateKPIs("midmarket");

  // Calculate manager performance data directly
  const managerPerformance = managers.map(manager => {
    const managerSellers = manager.sellers || [];
    const managerSellerIds = managerSellers.map((s: any) => s.id);
    
    // Get relationships for this manager's sellers
    const managerRelationships = relationships.filter(
      r => managerSellerIds.includes(r.seller_id)
    );
    
    // Calculate total revenue using simple sum of all division revenues
    const totalRevenue = managerRelationships.reduce((sum, rel) => {
      const account = rel.account;
      if (!account || !account.revenue) return sum;
      
      const revenueRow = Array.isArray(account.revenue) ? account.revenue[0] : account.revenue;
      if (!revenueRow) return sum;
      
      // Simple sum of all division revenues (no percentage weights)
      const totalAccountRevenue = 
        (revenueRow.revenue_esg || 0) +
        (revenueRow.revenue_gdt || 0) +
        (revenueRow.revenue_gvc || 0) +
        (revenueRow.revenue_msg_us || 0);
      
      return sum + totalAccountRevenue;
    }, 0);
    
    // Calculate enterprise vs midmarket seller breakdown
    const enterpriseSellers = managerSellers.filter((s: any) => s.size === 'enterprise');
    const midmarketSellers = managerSellers.filter((s: any) => s.size === 'midmarket');
    
    const enterpriseRevenue = managerRelationships
      .filter(rel => enterpriseSellers.some((s: any) => s.id === rel.seller_id))
      .reduce((sum, rel) => {
        const account = rel.account;
        if (!account || !account.revenue) return sum;
        
        const revenueRow = Array.isArray(account.revenue) ? account.revenue[0] : account.revenue;
        if (!revenueRow) return sum;
        
        // Simple sum of all division revenues (no percentage weights)
        const totalAccountRevenue = 
          (revenueRow.revenue_esg || 0) +
          (revenueRow.revenue_gdt || 0) +
          (revenueRow.revenue_gvc || 0) +
          (revenueRow.revenue_msg_us || 0);
        
        return sum + totalAccountRevenue;
      }, 0);
    
    const midmarketRevenue = managerRelationships
      .filter(rel => midmarketSellers.some((s: any) => s.id === rel.seller_id))
      .reduce((sum, rel) => {
        const account = rel.account;
        if (!account || !account.revenue) return sum;
        
        const revenueRow = Array.isArray(account.revenue) ? account.revenue[0] : account.revenue;
        if (!revenueRow) return sum;
        
        // Simple sum of all division revenues (no percentage weights)
        const totalAccountRevenue = 
          (revenueRow.revenue_esg || 0) +
          (revenueRow.revenue_gdt || 0) +
          (revenueRow.revenue_gvc || 0) +
          (revenueRow.revenue_msg_us || 0);
        
        return sum + totalAccountRevenue;
      }, 0);
    
    // Calculate division distribution
    const divisionCounts = managerSellers.reduce((acc: Record<string, number>, seller: any) => {
      acc[seller.division] = (acc[seller.division] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    // Get unique accounts for this manager (ensure no duplicates across all sellers)
    const uniqueAccountIds = Array.from(new Set(managerRelationships.map(rel => rel.account?.id).filter(Boolean)));
    const uniqueAccounts = uniqueAccountIds.length;
    
    return {
      ...manager,
      totalAccounts: uniqueAccounts,
      totalRevenue,
      avgRevenuePerAccount: uniqueAccounts > 0 ? totalRevenue / uniqueAccounts : 0,
      sellerCount: managerSellers.length,
      divisionCounts,
      enterpriseAccounts: enterpriseSellers.length,
      midmarketAccounts: midmarketSellers.length,
      enterpriseRevenue,
      midmarketRevenue,
    };
  });


  // Determine if filters are active
  const filtersActive = searchQuery || 
    !showRevenueHealthy || 
    !showRevenueUnhealthy || 
    !showAccountHealthy || 
    !showAccountUnhealthy ||
    !showJunior ||
    !showSenior ||
    !showESG ||
    !showGDT ||
    !showGVC ||
    !showMSG ||
    !showMIXED ||
    !showCompleted ||
    !showNotCompleted;

  // KPIs now automatically use filteredSellers, so they update with filters
  const displayEnterpriseKPIs = enterpriseKPIs;
  const displayMidmarketKPIs = midmarketKPIs;

  // Initialize finalized sellers state from database
  useEffect(() => {
    if (sellers.length > 0) {
      const finalizedIds = new Set(
        sellers.filter(seller => seller.book_finalized).map(seller => seller.id)
      );
      setFinalizedSellers(finalizedIds);
    }
  }, [sellers]);

  // Handle checkbox change for finalized status
  const handleFinalizedChange = async (sellerId: string, finalized: boolean) => {
    console.log('handleFinalizedChange called:', { sellerId, finalized });
    try {
      // Get seller info for audit log
      const seller = sellers.find(s => s.id === sellerId);
      console.log('Found seller:', seller?.name);
      
      const { error } = await supabase
        .from("sellers")
        .update({ book_finalized: finalized })
        .eq("id", sellerId);

      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }
      
      console.log('Supabase update successful');

      // Log audit event
      await logEvent(
        finalized ? 'book_finalized' : 'book_unfinalized',
        'seller',
        sellerId,
        { book_finalized: !finalized },
        { 
          book_finalized: finalized,
          seller_name: seller?.name,
          seller_division: seller?.division,
        }
      );

      // Update local state
      setFinalizedSellers(prev => {
        const newSet = new Set(prev);
        if (finalized) {
          newSet.add(sellerId);
        } else {
          newSet.delete(sellerId);
        }
        return newSet;
      });

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["sellers"] });
      queryClient.invalidateQueries({ queryKey: ["sellerRevenue"] });

      toast({
        title: "Status updated",
        description: `Seller's book of accounts ${finalized ? 'marked as finalized' : 'marked as not finalized'}.`,
      });
    } catch (error: any) {
      console.error('handleFinalizedChange error:', error);
      toast({
        title: "Update failed",
        description: error?.message ?? "Failed to update seller status",
        variant: "destructive",
      });
    }
  };

  // Combined loading state for all data fetching
  const isDataLoading = sellersLoading || accountsLoading || relationshipsLoading || 
                       accountsWithRevenueLoading || managersLoading || revenueDataLoading;

  // Show loading state while authentication is being checked or data is loading
  if (loading || isDataLoading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="container mx-auto p-6">
          <PageLoader text={loading ? "Authenticating..." : "Loading dashboard data..."} />
        </main>
      </div>
    );
  }

  // Don't render anything if not authenticated (will redirect)
  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      
      <main className="container mx-auto p-6 space-y-6">
        {/* Data Import functionality moved to Settings page */}

        {/* Search Bar */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Search Sellers
            </CardTitle>
            <CardDescription>
              Search for sellers by name and filter by performance indicators. Revenue and account health are determined by size (midmarket/enterprise) and seniority (junior ≤ 12 months, senior &gt; 12 months): sellers within their category's configured ranges show green indicators, while those outside the ranges show red indicators.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                type="text"
                placeholder="Search sellers by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            
            {/* Professional Filter System */}
            <div className="mt-6 bg-white border border-slate-200 rounded-lg shadow-sm">
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-slate-100 rounded-md">
                      <TrendingUp className="h-4 w-4 text-slate-600" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-slate-900">Filter Sellers</h3>
                      <p className="text-sm text-slate-500">Refine results by performance metrics and attributes</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowRevenueHealthy(true);
                        setShowRevenueUnhealthy(true);
                        setShowAccountHealthy(true);
                        setShowAccountUnhealthy(true);
                        setShowJunior(true);
                        setShowSenior(true);
                        setShowESG(true);
                        setShowGDT(true);
                        setShowGVC(true);
                        setShowMSG(true);
                        setShowMIXED(true);
                        setShowCompleted(true);
                        setShowNotCompleted(true);
                      }}
                      className="text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                    >
                      Select All
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowRevenueHealthy(false);
                        setShowRevenueUnhealthy(false);
                        setShowAccountHealthy(false);
                        setShowAccountUnhealthy(false);
                        setShowJunior(false);
                        setShowSenior(false);
                        setShowESG(false);
                        setShowGDT(false);
                        setShowGVC(false);
                        setShowMSG(false);
                        setShowMIXED(false);
                        setShowCompleted(false);
                        setShowNotCompleted(false);
                      }}
                      className="text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                    >
                      Clear All
                    </Button>
                  </div>
                </div>
              </div>
              <div className="p-6">
                
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                  {/* Performance Filters */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="p-1.5 bg-slate-100 rounded-md">
                        <DollarSign className="h-4 w-4 text-slate-600" />
                      </div>
                      <h4 className="font-medium text-slate-900">Performance Metrics</h4>
                    </div>
                    
                    <div className="space-y-2">
                      <div className={`flex items-center space-x-3 p-3 rounded-md border transition-colors ${
                        showRevenueHealthy 
                          ? 'border-green-200 bg-green-50' 
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}>
                        <Checkbox
                          id="revenue-healthy"
                          checked={showRevenueHealthy}
                          onCheckedChange={(checked) => setShowRevenueHealthy(checked as boolean)}
                          className="data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600"
                        />
                        <label htmlFor="revenue-healthy" className="flex items-center justify-between cursor-pointer flex-1">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                            <span className="text-sm font-medium text-slate-700">Healthy Revenue</span>
                          </div>
                          <span className="text-xs text-slate-500">Within range</span>
                        </label>
                      </div>
                      
                      <div className={`flex items-center space-x-3 p-3 rounded-md border transition-colors ${
                        showRevenueUnhealthy 
                          ? 'border-red-200 bg-red-50' 
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}>
                        <Checkbox
                          id="revenue-unhealthy"
                          checked={showRevenueUnhealthy}
                          onCheckedChange={(checked) => setShowRevenueUnhealthy(checked as boolean)}
                          className="data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600"
                        />
                        <label htmlFor="revenue-unhealthy" className="flex items-center justify-between cursor-pointer flex-1">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-red-500"></div>
                            <span className="text-sm font-medium text-slate-700">Needs Attention</span>
                          </div>
                          <span className="text-xs text-slate-500">Outside range</span>
                        </label>
                      </div>
                    </div>
                    
                    <div className="space-y-2 pt-4 border-t border-slate-200">
                      <div className={`flex items-center space-x-3 p-3 rounded-md border transition-colors ${
                        showAccountHealthy 
                          ? 'border-green-200 bg-green-50' 
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}>
                        <Checkbox
                          id="account-healthy"
                          checked={showAccountHealthy}
                          onCheckedChange={(checked) => setShowAccountHealthy(checked as boolean)}
                          className="data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600"
                        />
                        <label htmlFor="account-healthy" className="flex items-center justify-between cursor-pointer flex-1">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                            <span className="text-sm font-medium text-slate-700">Manageable Load</span>
                          </div>
                          <span className="text-xs text-slate-500">Within category limit</span>
                        </label>
                      </div>
                      
                      <div className={`flex items-center space-x-3 p-3 rounded-md border transition-colors ${
                        showAccountUnhealthy 
                          ? 'border-red-200 bg-red-50' 
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}>
                        <Checkbox
                          id="account-unhealthy"
                          checked={showAccountUnhealthy}
                          onCheckedChange={(checked) => setShowAccountUnhealthy(checked as boolean)}
                          className="data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600"
                        />
                        <label htmlFor="account-unhealthy" className="flex items-center justify-between cursor-pointer flex-1">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-red-500"></div>
                            <span className="text-sm font-medium text-slate-700">Overloaded</span>
                          </div>
                          <span className="text-xs text-slate-500">Over category limit</span>
                        </label>
                      </div>
                    </div>
                  </div>
                  
                  {/* Seniority Filters */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="p-1.5 bg-slate-100 rounded-md">
                        <Star className="h-4 w-4 text-slate-600" />
                      </div>
                      <h4 className="font-medium text-slate-900">Experience Level</h4>
                    </div>
                    
                    <div className="space-y-2">
                      <div className={`flex items-center space-x-3 p-3 rounded-md border transition-colors ${
                        showSenior 
                          ? 'border-blue-200 bg-blue-50' 
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}>
                        <Checkbox
                          id="senior"
                          checked={showSenior}
                          onCheckedChange={(checked) => setShowSenior(checked as boolean)}
                          className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                        />
                        <label htmlFor="senior" className="flex items-center justify-between cursor-pointer flex-1">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                            <span className="text-sm font-medium text-slate-700">Senior</span>
                          </div>
                          <span className="text-xs text-slate-500">&gt; 12 months</span>
                        </label>
                      </div>
                      
                      <div className={`flex items-center space-x-3 p-3 rounded-md border transition-colors ${
                        showJunior 
                          ? 'border-amber-200 bg-amber-50' 
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}>
                        <Checkbox
                          id="junior"
                          checked={showJunior}
                          onCheckedChange={(checked) => setShowJunior(checked as boolean)}
                          className="data-[state=checked]:bg-amber-600 data-[state=checked]:border-amber-600"
                        />
                        <label htmlFor="junior" className="flex items-center justify-between cursor-pointer flex-1">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                            <span className="text-sm font-medium text-slate-700">Junior</span>
                          </div>
                          <span className="text-xs text-slate-500">≤ 12 months</span>
                        </label>
                      </div>
                    </div>
                  </div>
                  
                  {/* Division Filters */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="p-1.5 bg-slate-100 rounded-md">
                        <Briefcase className="h-4 w-4 text-slate-600" />
                      </div>
                      <h4 className="font-medium text-slate-900">Business Division</h4>
                    </div>
                    
                    <div className="space-y-2">
                      <div className={`flex items-center space-x-3 p-3 rounded-md border transition-colors ${
                        showESG 
                          ? 'border-emerald-200 bg-emerald-50' 
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}>
                        <Checkbox
                          id="esg"
                          checked={showESG}
                          onCheckedChange={(checked) => setShowESG(checked as boolean)}
                          className="data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                        />
                        <label htmlFor="esg" className="flex items-center justify-between cursor-pointer flex-1">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                            <span className="text-sm font-medium text-slate-700">ESG</span>
                          </div>
                          <span className="text-xs text-slate-500">Environmental</span>
                        </label>
                      </div>
                      
                      <div className={`flex items-center space-x-3 p-3 rounded-md border transition-colors ${
                        showGDT 
                          ? 'border-blue-200 bg-blue-50' 
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}>
                        <Checkbox
                          id="gdt"
                          checked={showGDT}
                          onCheckedChange={(checked) => setShowGDT(checked as boolean)}
                          className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                        />
                        <label htmlFor="gdt" className="flex items-center justify-between cursor-pointer flex-1">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                            <span className="text-sm font-medium text-slate-700">GDT</span>
                          </div>
                          <span className="text-xs text-slate-500">Global Data</span>
                        </label>
                      </div>
                      
                      <div className={`flex items-center space-x-3 p-3 rounded-md border transition-colors ${
                        showGVC 
                          ? 'border-purple-200 bg-purple-50' 
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}>
                        <Checkbox
                          id="gvc"
                          checked={showGVC}
                          onCheckedChange={(checked) => setShowGVC(checked as boolean)}
                          className="data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
                        />
                        <label htmlFor="gvc" className="flex items-center justify-between cursor-pointer flex-1">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                            <span className="text-sm font-medium text-slate-700">GVC</span>
                          </div>
                          <span className="text-xs text-slate-500">Global Value</span>
                        </label>
                      </div>
                      
                      <div className={`flex items-center space-x-3 p-3 rounded-md border transition-colors ${
                        showMSG 
                          ? 'border-indigo-200 bg-indigo-50' 
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}>
                        <Checkbox
                          id="msg"
                          checked={showMSG}
                          onCheckedChange={(checked) => setShowMSG(checked as boolean)}
                          className="data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                        />
                        <label htmlFor="msg" className="flex items-center justify-between cursor-pointer flex-1">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                            <span className="text-sm font-medium text-slate-700">MSG US</span>
                          </div>
                          <span className="text-xs text-slate-500">US Market</span>
                        </label>
                      </div>
                      
                      <div className={`flex items-center space-x-3 p-3 rounded-md border transition-colors ${
                        showMIXED 
                          ? 'border-slate-200 bg-slate-50' 
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}>
                        <Checkbox
                          id="mixed"
                          checked={showMIXED}
                          onCheckedChange={(checked) => setShowMIXED(checked as boolean)}
                          className="data-[state=checked]:bg-slate-600 data-[state=checked]:border-slate-600"
                        />
                        <label htmlFor="mixed" className="flex items-center justify-between cursor-pointer flex-1">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-slate-500"></div>
                            <span className="text-sm font-medium text-slate-700">MIXED</span>
                          </div>
                          <span className="text-xs text-slate-500">Multiple divisions</span>
                        </label>
                      </div>
                    </div>
                  </div>
                  
                  {/* Completion Status Filters */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="p-1.5 bg-slate-100 rounded-md">
                        <Checkbox className="h-4 w-4 text-slate-600" />
                      </div>
                      <h4 className="font-medium text-slate-900">Completion Status</h4>
                    </div>
                    
                    <div className="space-y-2">
                      <div className={`flex items-center space-x-3 p-3 rounded-md border transition-colors ${
                        showCompleted 
                          ? 'border-green-200 bg-green-50' 
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}>
                        <Checkbox
                          id="completed"
                          checked={showCompleted}
                          onCheckedChange={(checked) => setShowCompleted(checked as boolean)}
                          className="data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600"
                        />
                        <label htmlFor="completed" className="flex items-center justify-between cursor-pointer flex-1">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                            <span className="text-sm font-medium text-slate-700">Completed</span>
                          </div>
                          <span className="text-xs text-slate-500">Book finalized</span>
                        </label>
                      </div>
                      
                      <div className={`flex items-center space-x-3 p-3 rounded-md border transition-colors ${
                        showNotCompleted 
                          ? 'border-orange-200 bg-orange-50' 
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}>
                        <Checkbox
                          id="not-completed"
                          checked={showNotCompleted}
                          onCheckedChange={(checked) => setShowNotCompleted(checked as boolean)}
                          className="data-[state=checked]:bg-orange-600 data-[state=checked]:border-orange-600"
                        />
                        <label htmlFor="not-completed" className="flex items-center justify-between cursor-pointer flex-1">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                            <span className="text-sm font-medium text-slate-700">In Progress</span>
                          </div>
                          <span className="text-xs text-slate-500">Book not finalized</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Filter Summary */}
                <div className="mt-6 pt-4 border-t border-slate-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Users className="h-4 w-4" />
                      <span>Showing {filteredSellers.length} of {sellers.length} sellers</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span className="px-2 py-1 bg-slate-100 rounded text-slate-600">
                        Revenue: {showRevenueHealthy && showRevenueUnhealthy ? 'All' : showRevenueHealthy ? 'Healthy' : 'Needs attention'}
                      </span>
                      <span className="px-2 py-1 bg-slate-100 rounded text-slate-600">
                        Experience: {showJunior && showSenior ? 'All' : showJunior ? 'Junior' : 'Senior'}
                      </span>
                      <span className="px-2 py-1 bg-slate-100 rounded text-slate-600">
                        Division: {[showESG, showGDT, showGVC, showMSG, showMIXED].filter(Boolean).length === 5 ? 'All' : `${[showESG, showGDT, showGVC, showMSG, showMIXED].filter(Boolean).length} selected`}
                      </span>
                      <span className="px-2 py-1 bg-slate-100 rounded text-slate-600">
                        Status: {showCompleted && showNotCompleted ? 'All' : showCompleted ? 'Completed' : 'In Progress'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {(searchQuery || !showRevenueHealthy || !showRevenueUnhealthy || !showAccountHealthy || !showAccountUnhealthy || !showCompleted || !showNotCompleted) && (
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                  <p className="text-sm text-blue-700 font-medium">
                    Showing {filteredSellers.length} seller{filteredSellers.length !== 1 ? 's' : ''}
                    {searchQuery && ` matching "${searchQuery}"`}
                    {(!showRevenueHealthy || !showRevenueUnhealthy || !showAccountHealthy || !showAccountUnhealthy || !showCompleted || !showNotCompleted) && ' (filtered by performance and status)'}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* KPI Tabs */}
        <Tabs defaultValue="enterprise" className="w-full">
          <TabsList className={`grid w-full ${profile?.role === "MASTER" ? "grid-cols-3" : "grid-cols-2"}`}>
            <TabsTrigger value="enterprise">Enterprise</TabsTrigger>
            <TabsTrigger value="midmarket">Midmarket</TabsTrigger>
            {profile?.role === "MASTER" && (
              <TabsTrigger value="managers">Managers</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="enterprise" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              <Card className="shadow-card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Total Assigned Accounts
                    {filtersActive && <span className="text-xs text-blue-600 ml-2">(filtered)</span>}
                  </CardTitle>
                  <Briefcase className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{displayEnterpriseKPIs.accountCount || 0}</div>
                </CardContent>
              </Card>
              
              <Card className="shadow-card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Total Revenue
                    {filtersActive && <span className="text-xs text-blue-600 ml-2">(filtered)</span>}
                  </CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    ${displayEnterpriseKPIs.totalRevenue.toLocaleString()}
                  </div>
                </CardContent>
              </Card>
              
              <Card className="shadow-card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Avg Revenue/Account
                    {filtersActive && <span className="text-xs text-blue-600 ml-2">(filtered)</span>}
                  </CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    ${displayEnterpriseKPIs.avgRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </div>
                </CardContent>
              </Card>
              
              <Card className="shadow-card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Total Sellers
                    {filtersActive && <span className="text-xs text-blue-600 ml-2">(filtered)</span>}
                  </CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{displayEnterpriseKPIs.sellerCount || 0}</div>
                </CardContent>
              </Card>
            </div>

            {/* Enterprise Seller Tiles */}
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle>Enterprise Sellers</CardTitle>
                <CardDescription>
                  Click on a seller to view details and manage account assignments
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {filteredSellers
                    .filter(s => s.size === 'enterprise')
                    .map(seller => (
                      <Card key={seller.id} className="transition-all hover:shadow-lg hover:scale-[1.02]">
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <CardTitle className="text-base">{seller.name}</CardTitle>
                            <DivisionBadge division={seller.division} />
                          </div>
                          <div className="flex flex-col gap-1 mb-2">
                            {/* Red Flag - positioned above seniority badge */}
                            {seller.hasSizeMismatch && (
                              <div className="flex items-center gap-1 text-red-600 font-bold text-[10px] bg-red-50 px-1.5 py-0.5 rounded border border-red-200 w-fit">
                                <span>🚩</span>
                                <span>{seller.mismatchType} ({seller.mismatchedAccountCount})</span>
                              </div>
                            )}
                            {/* Yellow Flag - industry mismatch - below red flag */}
                            {seller.hasIndustryMismatch && (
                              <div className="flex items-center gap-1 text-yellow-700 font-bold text-[10px] bg-yellow-50 px-1.5 py-0.5 rounded border border-yellow-200 w-fit">
                                <span>⚠️</span>
                                <span>INDUSTRY ({seller.industryMismatchedAccountCount})</span>
                              </div>
                            )}
                            {/* Seniority Badge */}
                            <div className="flex items-center gap-2">
                              <Badge 
                                variant={((seller.tenure_months || 0) > 12) ? 'default' : 'outline'}
                                className={`text-xs ${
                                  ((seller.tenure_months || 0) > 12)
                                    ? 'bg-green-100 text-green-700 border-green-200' 
                                    : 'bg-orange-100 text-orange-700 border-orange-200'
                                }`}
                              >
                                <Star className="h-3 w-3 mr-1" />
                                {((seller.tenure_months || 0) > 12) ? 'Senior' : 'Junior'}
                              </Badge>
                            </div>
                          </div>
                          <CardDescription className="text-xs">
                            {seller.manager?.name || "No Manager"}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <p className="text-sm text-muted-foreground">
                                {seller.accountCount || 0} accounts
                              </p>
                              <div className={`w-2 h-2 rounded-full ${seller.isAccountCountHealthy ? 'bg-green-500' : 'bg-red-500'}`} />
                            </div>
                            <div className="flex items-center justify-between">
                              <p className="text-lg font-semibold text-primary">
                                ${seller.totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                              </p>
                              <div className={`w-2 h-2 rounded-full ${seller.isRevenueHealthy ? 'bg-green-500' : 'bg-red-500'}`} />
                            </div>
                          </div>
                          <div className="flex items-center space-x-2 pt-2 border-t">
                            <Checkbox
                              id={`finalized-${seller.id}`}
                              checked={finalizedSellers.has(seller.id)}
                              onCheckedChange={(checked) => 
                                handleFinalizedChange(seller.id, checked as boolean)
                              }
                            />
                            <label 
                              htmlFor={`finalized-${seller.id}`}
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                            >
                              Book finalized
                            </label>
                          </div>
                          <Link href={`/sellers/${seller.id}`} className="block">
                            <Button variant="outline" size="sm" className="w-full">
                              View Details
                            </Button>
                          </Link>
                        </CardContent>
                      </Card>
                    ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="midmarket" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              <Card className="shadow-card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Total Assigned Accounts
                    {filtersActive && <span className="text-xs text-blue-600 ml-2">(filtered)</span>}
                  </CardTitle>
                  <Briefcase className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{displayMidmarketKPIs.accountCount || 0}</div>
                </CardContent>
              </Card>
              
              <Card className="shadow-card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Total Revenue
                    {filtersActive && <span className="text-xs text-blue-600 ml-2">(filtered)</span>}
                  </CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    ${displayMidmarketKPIs.totalRevenue.toLocaleString()}
                  </div>
                </CardContent>
              </Card>
              
              <Card className="shadow-card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Avg Revenue/Account
                    {filtersActive && <span className="text-xs text-blue-600 ml-2">(filtered)</span>}
                  </CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    ${displayMidmarketKPIs.avgRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </div>
                </CardContent>
              </Card>
              
              <Card className="shadow-card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Total Sellers
                    {filtersActive && <span className="text-xs text-blue-600 ml-2">(filtered)</span>}
                  </CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{displayMidmarketKPIs.sellerCount || 0}</div>
                </CardContent>
              </Card>
            </div>

            {/* Midmarket Seller Tiles */}
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle>Midmarket Sellers</CardTitle>
                <CardDescription>
                  Click on a seller to view details and manage account assignments
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {filteredSellers
                    .filter(s => s.size === 'midmarket')
                    .map(seller => (
                      <Card key={seller.id} className="transition-all hover:shadow-lg hover:scale-[1.02]">
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <CardTitle className="text-base">{seller.name}</CardTitle>
                            <DivisionBadge division={seller.division} />
                          </div>
                          <div className="flex flex-col gap-1 mb-2">
                            {/* Red Flag - positioned above seniority badge */}
                            {seller.hasSizeMismatch && (
                              <div className="flex items-center gap-1 text-red-600 font-bold text-[10px] bg-red-50 px-1.5 py-0.5 rounded border border-red-200 w-fit">
                                <span>🚩</span>
                                <span>{seller.mismatchType} ({seller.mismatchedAccountCount})</span>
                              </div>
                            )}
                            {/* Yellow Flag - industry mismatch - below red flag */}
                            {seller.hasIndustryMismatch && (
                              <div className="flex items-center gap-1 text-yellow-700 font-bold text-[10px] bg-yellow-50 px-1.5 py-0.5 rounded border border-yellow-200 w-fit">
                                <span>⚠️</span>
                                <span>INDUSTRY ({seller.industryMismatchedAccountCount})</span>
                              </div>
                            )}
                            {/* Seniority Badge */}
                            <div className="flex items-center gap-2">
                              <Badge 
                                variant={((seller.tenure_months || 0) > 12) ? 'default' : 'outline'}
                                className={`text-xs ${
                                  ((seller.tenure_months || 0) > 12)
                                    ? 'bg-green-100 text-green-700 border-green-200' 
                                    : 'bg-orange-100 text-orange-700 border-orange-200'
                                }`}
                              >
                                <Star className="h-3 w-3 mr-1" />
                                {((seller.tenure_months || 0) > 12) ? 'Senior' : 'Junior'}
                              </Badge>
                            </div>
                          </div>
                          <CardDescription className="text-xs">
                            {seller.manager?.name || "No Manager"}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <p className="text-sm text-muted-foreground">
                                {seller.accountCount || 0} accounts
                              </p>
                              <div className={`w-2 h-2 rounded-full ${seller.isAccountCountHealthy ? 'bg-green-500' : 'bg-red-500'}`} />
                            </div>
                            <div className="flex items-center justify-between">
                              <p className="text-lg font-semibold text-primary">
                                ${seller.totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                              </p>
                              <div className={`w-2 h-2 rounded-full ${seller.isRevenueHealthy ? 'bg-green-500' : 'bg-red-500'}`} />
                            </div>
                          </div>
                          <div className="flex items-center space-x-2 pt-2 border-t">
                            <Checkbox
                              id={`finalized-${seller.id}`}
                              checked={finalizedSellers.has(seller.id)}
                              onCheckedChange={(checked) => 
                                handleFinalizedChange(seller.id, checked as boolean)
                              }
                            />
                            <label 
                              htmlFor={`finalized-${seller.id}`}
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                            >
                              Book finalized
                            </label>
                          </div>
                          <Link href={`/sellers/${seller.id}`} className="block">
                            <Button variant="outline" size="sm" className="w-full">
                              View Details
                            </Button>
                          </Link>
                        </CardContent>
                      </Card>
                    ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {profile?.role === "MASTER" && (
            <TabsContent value="managers" className="space-y-6">
            {/* Manager Performance Overview */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card className="shadow-card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Managers</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{managers.length}</div>
                </CardContent>
              </Card>
              
              <Card className="shadow-card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Assigned Accounts</CardTitle>
                  <Briefcase className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {managerPerformance.reduce((sum, m) => sum + m.totalAccounts, 0)}
                  </div>
               <div className="text-xs text-muted-foreground mt-1">
                 Enterprise Sellers: {managerPerformance.reduce((sum, m) => sum + m.enterpriseAccounts, 0)} | 
                 Midmarket Sellers: {managerPerformance.reduce((sum, m) => sum + m.midmarketAccounts, 0)}
               </div>
                </CardContent>
              </Card>
              
              <Card className="shadow-card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    ${managerPerformance.reduce((sum, m) => sum + m.totalRevenue, 0).toLocaleString()}
                  </div>
               <div className="text-xs text-muted-foreground mt-1">
                 Enterprise Sellers: ${managerPerformance.reduce((sum, m) => sum + m.enterpriseRevenue, 0).toLocaleString()} | 
                 Midmarket Sellers: ${managerPerformance.reduce((sum, m) => sum + m.midmarketRevenue, 0).toLocaleString()}
               </div>
                </CardContent>
              </Card>
              
              <Card className="shadow-card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Avg Revenue/Manager</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    ${managerPerformance.length > 0 
                      ? (managerPerformance.reduce((sum, m) => sum + m.totalRevenue, 0) / managerPerformance.length).toLocaleString(undefined, { maximumFractionDigits: 0 })
                      : 0}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Manager Performance Cards */}
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle>Manager Performance</CardTitle>
                <CardDescription>
                  Performance metrics for each manager including total accounts, revenue, and team composition
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {managerPerformance.map(manager => (
                    <Card key={manager.id} className="transition-all hover:shadow-lg hover:scale-[1.02]">
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <CardTitle className="text-base">{manager.name}</CardTitle>
                          <div className="text-xs text-muted-foreground">
                            {manager.sellerCount} seller{manager.sellerCount !== 1 ? 's' : ''}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Divisions: {Object.keys(manager.divisionCounts).join(', ')}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-sm text-muted-foreground">Total Assigned Accounts</p>
                            <p className="text-lg font-semibold text-primary">
                              {manager.totalAccounts}
                            </p>
                          </div>
                          <div className="flex items-center justify-between">
                            <p className="text-sm text-muted-foreground">Total Revenue</p>
                            <p className="text-lg font-semibold text-primary">
                              ${manager.totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </p>
                          </div>
                          <div className="flex items-center justify-between">
                            <p className="text-sm text-muted-foreground">Avg per Account</p>
                            <p className="text-sm font-medium text-muted-foreground">
                              ${manager.avgRevenuePerAccount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </p>
                          </div>
                        </div>
                        
                     {/* Enterprise vs Midmarket seller breakdown */}
                     <div className="pt-2 border-t">
                       <p className="text-xs font-medium text-muted-foreground mb-2">Seller Breakdown</p>
                       <div className="space-y-1">
                         <div className="flex justify-between text-xs">
                           <span className="text-muted-foreground">Enterprise Sellers</span>
                           <span className="font-medium">{manager.enterpriseAccounts} sellers</span>
                         </div>
                         <div className="flex justify-between text-xs">
                           <span className="text-muted-foreground">Enterprise Revenue</span>
                           <span className="font-medium text-green-600">
                             ${manager.enterpriseRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                           </span>
                         </div>
                         <div className="flex justify-between text-xs">
                           <span className="text-muted-foreground">Midmarket Sellers</span>
                           <span className="font-medium">{manager.midmarketAccounts} sellers</span>
                         </div>
                         <div className="flex justify-between text-xs">
                           <span className="text-muted-foreground">Midmarket Revenue</span>
                           <span className="font-medium text-blue-600">
                             ${manager.midmarketRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                           </span>
                         </div>
                       </div>
                     </div>
                        
                        {/* Division breakdown */}
                        <div className="pt-2 border-t">
                          <p className="text-xs font-medium text-muted-foreground mb-2">Team Composition</p>
                          <div className="space-y-1">
                            {Object.entries(manager.divisionCounts).map(([division, count]) => (
                              <div key={division} className="flex justify-between text-xs">
                                <span className="text-muted-foreground">{division}</span>
                                <span className="font-medium">{count as number}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
            </TabsContent>
          )}
        </Tabs>
      </main>
    </div>
  );
}
