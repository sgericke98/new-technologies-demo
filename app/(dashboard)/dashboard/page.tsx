'use client'

import { useAuth } from "@/contexts/AuthContext";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Users, DollarSign, Briefcase, TrendingUp } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DivisionBadge } from "@/components/dashboard/DivisionBadge";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useAudit } from "@/hooks/use-audit";
// Import functionality moved to Settings page

export default function DashboardPage() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { logEvent } = useAudit();
  // Import functionality moved to Settings page
  const [searchQuery, setSearchQuery] = useState("");
  const [finalizedSellers, setFinalizedSellers] = useState<Set<string>>(new Set());
  
  // Thresholds for visual indicators
  const [revenueThreshold, setRevenueThreshold] = useState(10_000_000);
  const [accountThreshold, setAccountThreshold] = useState(5);
  
  // Filter states
  const [showRevenueHealthy, setShowRevenueHealthy] = useState(true);
  const [showRevenueUnhealthy, setShowRevenueUnhealthy] = useState(true);
  const [showAccountHealthy, setShowAccountHealthy] = useState(true);
  const [showAccountUnhealthy, setShowAccountUnhealthy] = useState(true);

  // File input refs moved to Settings page

  // Fetch threshold settings
  useEffect(() => {
    const fetchThresholds = async () => {
      try {
        const { data, error } = await supabase
          .from('threshold_settings')
          .select('revenue_threshold, account_threshold')
          .single();

        if (error && error.code !== 'PGRST116') {
          console.error('Error fetching thresholds:', error);
          return;
        }

        if (data) {
          setRevenueThreshold(data.revenue_threshold || 10_000_000);
          setAccountThreshold(data.account_threshold || 5);
        }
      } catch (error) {
        console.error('Error fetching thresholds:', error);
      }
    };

    fetchThresholds();
  }, []);

  // Fetch sellers (manager-scoped for MANAGER role)
  const { data: sellers = [] } = useQuery({
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

  // Fetch accounts
  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("*")
        .order("name");
      
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch relationship maps for revenue calculations (only must_keep status)
  const { data: relationships = [] } = useQuery({
    queryKey: ["relationship_maps"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("relationship_maps")
        .select(`
          *,
          account:accounts!inner(*, revenue:account_revenues!inner(*))
        `)
        .eq("status", "must_keep");
      
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch accounts with revenue for accurate KPIs
  const { data: accountsWithRevenue = [] } = useQuery({
    queryKey: ["accounts-with-revenue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("*, revenue:account_revenues!inner(*)");
      
      if (error) throw error;
      return data || [];
    },
  });


  // Fetch managers with their sellers for team composition
  const { data: managers = [] } = useQuery({
    queryKey: ["managers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("managers")
        .select(`
          *,
          sellers:sellers(id, name, division, size)
        `);
      
      if (error) throw error;
      return data || [];
    },
  });

  // Calculate KPIs by size using weighted revenue (filter by seller size)
  const calculateKPIs = (size: "enterprise" | "midmarket") => {
    const sizeSellers = sellers.filter(s => s.size === size);
    const sizeSellerIds = sizeSellers.map(s => s.id);
    
    // Get relationships for sellers of this size
    const sizeRelationships = relationships.filter(
      r => sizeSellerIds.includes(r.seller_id)
    );
    
    // Calculate total weighted revenue for this size
    const totalRevenue = sizeRelationships.reduce((sum, rel) => {
      const account = rel.account;
      if (!account || !account.revenue) return sum;
      
      const revenueRow = Array.isArray(account.revenue) ? account.revenue[0] : account.revenue;
      if (!revenueRow) return sum;
      
      // Apply percentage weights from relationship_maps (same logic as seller_revenue_view)
      const weightedRevenue = 
        ((revenueRow.revenue_esg || 0) * (rel.pct_esg || 0) / 100) +
        ((revenueRow.revenue_gdt || 0) * (rel.pct_gdt || 0) / 100) +
        ((revenueRow.revenue_gvc || 0) * (rel.pct_gvc || 0) / 100) +
        ((revenueRow.revenue_msg_us || 0) * (rel.pct_msg_us || 0) / 100);
      
      return sum + weightedRevenue;
    }, 0);

    // Get unique accounts for this size
    const uniqueAccounts = Array.from(new Set(sizeRelationships.map(rel => rel.account?.id).filter(Boolean)));
    
    const avgRevenue = uniqueAccounts.length > 0 
      ? totalRevenue / uniqueAccounts.length 
      : 0;

    return {
      accountCount: uniqueAccounts.length,
      sellerCount: sizeSellers.length,
      totalRevenue,
      avgRevenue,
    };
  };

  const enterpriseKPIs = calculateKPIs("enterprise");
  const midmarketKPIs = calculateKPIs("midmarket");

  // Import handler moved to Settings page

  // Fetch seller revenues from centralized view
  const { data: revenueData = [] } = useQuery({
    queryKey: ["sellerRevenue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("seller_revenue_view")
        .select("seller_id, seller_total_revenue");
      
      if (error) throw error;
      return data || [];
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
      
      // Apply percentage weights from relationship_maps (same logic as seller_revenue_view)
      const weightedRevenue = 
        ((revenueRow.revenue_esg || 0) * (rel.pct_esg || 0) / 100) +
        ((revenueRow.revenue_gdt || 0) * (rel.pct_gdt || 0) / 100) +
        ((revenueRow.revenue_gvc || 0) * (rel.pct_gvc || 0) / 100) +
        ((revenueRow.revenue_msg_us || 0) * (rel.pct_msg_us || 0) / 100);
      
      return sum + weightedRevenue;
    }, 0);
    
    const accountCount = sellerRelationships.length;
    
    // Calculate health indicators
    const isRevenueHealthy = totalRevenue >= revenueThreshold;
    const isAccountCountHealthy = accountCount <= accountThreshold;

    return {
      ...seller,
      accountCount,
      totalRevenue,
      isRevenueHealthy,
      isAccountCountHealthy,
    };
  });

  // Filter sellers based on search query and health indicators
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
    
    return matchesSearch && matchesRevenueFilter && matchesAccountFilter;
  });

  // Calculate filtered KPIs based on active filters
  const calculateFilteredKPIs = (size: "enterprise" | "midmarket") => {
    const filteredSizeSellers = filteredSellers.filter(seller => seller.size === size);
    
    if (filteredSizeSellers.length === 0) {
      return {
        accountCount: 0,
        sellerCount: 0,
        totalRevenue: 0,
        avgRevenue: 0,
      };
    }

    const totalRevenue = filteredSizeSellers.reduce((sum, seller) => sum + seller.totalRevenue, 0);
    const totalAccounts = filteredSizeSellers.reduce((sum, seller) => sum + seller.accountCount, 0);
    const avgRevenue = filteredSizeSellers.length > 0 ? totalRevenue / filteredSizeSellers.length : 0;

    return {
      accountCount: totalAccounts,
      sellerCount: filteredSizeSellers.length,
      totalRevenue,
      avgRevenue,
    };
  };

  const filteredEnterpriseKPIs = calculateFilteredKPIs("enterprise");
  const filteredMidmarketKPIs = calculateFilteredKPIs("midmarket");

  // Calculate manager performance data directly
  const managerPerformance = managers.map(manager => {
    const managerSellers = manager.sellers || [];
    const managerSellerIds = managerSellers.map(s => s.id);
    
    // Get relationships for this manager's sellers
    const managerRelationships = relationships.filter(
      r => managerSellerIds.includes(r.seller_id)
    );
    
    // Calculate total revenue using weighted percentages
    const totalRevenue = managerRelationships.reduce((sum, rel) => {
      const account = rel.account;
      if (!account || !account.revenue) return sum;
      
      const revenueRow = Array.isArray(account.revenue) ? account.revenue[0] : account.revenue;
      if (!revenueRow) return sum;
      
      const weightedRevenue = 
        ((revenueRow.revenue_esg || 0) * (rel.pct_esg || 0) / 100) +
        ((revenueRow.revenue_gdt || 0) * (rel.pct_gdt || 0) / 100) +
        ((revenueRow.revenue_gvc || 0) * (rel.pct_gvc || 0) / 100) +
        ((revenueRow.revenue_msg_us || 0) * (rel.pct_msg_us || 0) / 100);
      
      return sum + weightedRevenue;
    }, 0);
    
    // Calculate enterprise vs midmarket seller breakdown
    const enterpriseSellers = managerSellers.filter(s => s.size === 'enterprise');
    const midmarketSellers = managerSellers.filter(s => s.size === 'midmarket');
    
    const enterpriseRevenue = managerRelationships
      .filter(rel => enterpriseSellers.some(s => s.id === rel.seller_id))
      .reduce((sum, rel) => {
        const account = rel.account;
        if (!account || !account.revenue) return sum;
        
        const revenueRow = Array.isArray(account.revenue) ? account.revenue[0] : account.revenue;
        if (!revenueRow) return sum;
        
        const weightedRevenue = 
          ((revenueRow.revenue_esg || 0) * (rel.pct_esg || 0) / 100) +
          ((revenueRow.revenue_gdt || 0) * (rel.pct_gdt || 0) / 100) +
          ((revenueRow.revenue_gvc || 0) * (rel.pct_gvc || 0) / 100) +
          ((revenueRow.revenue_msg_us || 0) * (rel.pct_msg_us || 0) / 100);
        
        return sum + weightedRevenue;
      }, 0);
    
    const midmarketRevenue = managerRelationships
      .filter(rel => midmarketSellers.some(s => s.id === rel.seller_id))
      .reduce((sum, rel) => {
        const account = rel.account;
        if (!account || !account.revenue) return sum;
        
        const revenueRow = Array.isArray(account.revenue) ? account.revenue[0] : account.revenue;
        if (!revenueRow) return sum;
        
        const weightedRevenue = 
          ((revenueRow.revenue_esg || 0) * (rel.pct_esg || 0) / 100) +
          ((revenueRow.revenue_gdt || 0) * (rel.pct_gdt || 0) / 100) +
          ((revenueRow.revenue_gvc || 0) * (rel.pct_gvc || 0) / 100) +
          ((revenueRow.revenue_msg_us || 0) * (rel.pct_msg_us || 0) / 100);
        
        return sum + weightedRevenue;
      }, 0);
    
    // Calculate division distribution
    const divisionCounts = managerSellers.reduce((acc, seller) => {
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
    !showAccountUnhealthy;

  // Use filtered KPIs when filters are active, otherwise use original KPIs
  const displayEnterpriseKPIs = filtersActive ? filteredEnterpriseKPIs : enterpriseKPIs;
  const displayMidmarketKPIs = filtersActive ? filteredMidmarketKPIs : midmarketKPIs;

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
    try {
      // Get seller info for audit log
      const seller = sellers.find(s => s.id === sellerId);
      
      const { error } = await supabase
        .from("sellers")
        .update({ book_finalized: finalized })
        .eq("id", sellerId);

      if (error) throw error;

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
  };

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
              Search for sellers by name to quickly find specific team members
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
            
            {/* Health Indicator Filters */}
            <div className="mt-6 p-4 bg-slate-50 rounded-lg border">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-700">Filter by Performance</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowRevenueHealthy(true);
                    setShowRevenueUnhealthy(true);
                    setShowAccountHealthy(true);
                    setShowAccountUnhealthy(true);
                  }}
                  className="text-xs text-slate-500 hover:text-slate-700"
                >
                  Show All
                </Button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Revenue Filters */}
                <div className="space-y-3">
                  <h4 className="text-xs font-medium text-slate-600 uppercase tracking-wide">Revenue Performance</h4>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-3 p-2 rounded-md hover:bg-white/60 transition-colors">
                      <Checkbox
                        id="revenue-healthy"
                        checked={showRevenueHealthy}
                        onCheckedChange={(checked) => setShowRevenueHealthy(checked as boolean)}
                      />
                      <label htmlFor="revenue-healthy" className="flex items-center gap-2 text-sm font-medium cursor-pointer flex-1">
                        <div className="w-3 h-3 rounded-full bg-green-500 shadow-sm"></div>
                        <span className="text-slate-700">Healthy Revenue</span>
                        <span className="text-xs text-slate-500 ml-auto">≥ ${(revenueThreshold / 1_000_000).toFixed(0)}M</span>
                      </label>
                    </div>
                    
                    <div className="flex items-center space-x-3 p-2 rounded-md hover:bg-white/60 transition-colors">
                      <Checkbox
                        id="revenue-unhealthy"
                        checked={showRevenueUnhealthy}
                        onCheckedChange={(checked) => setShowRevenueUnhealthy(checked as boolean)}
                      />
                      <label htmlFor="revenue-unhealthy" className="flex items-center gap-2 text-sm font-medium cursor-pointer flex-1">
                        <div className="w-3 h-3 rounded-full bg-red-500 shadow-sm"></div>
                        <span className="text-slate-700">Low Revenue</span>
                        <span className="text-xs text-slate-500 ml-auto">&lt; ${(revenueThreshold / 1_000_000).toFixed(0)}M</span>
                      </label>
                    </div>
                  </div>
                </div>
                
                {/* Account Filters */}
                <div className="space-y-3">
                  <h4 className="text-xs font-medium text-slate-600 uppercase tracking-wide">Account Load</h4>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-3 p-2 rounded-md hover:bg-white/60 transition-colors">
                      <Checkbox
                        id="account-healthy"
                        checked={showAccountHealthy}
                        onCheckedChange={(checked) => setShowAccountHealthy(checked as boolean)}
                      />
                      <label htmlFor="account-healthy" className="flex items-center gap-2 text-sm font-medium cursor-pointer flex-1">
                        <div className="w-3 h-3 rounded-full bg-green-500 shadow-sm"></div>
                        <span className="text-slate-700">Manageable Load</span>
                        <span className="text-xs text-slate-500 ml-auto">≤ {accountThreshold} accounts</span>
                      </label>
                    </div>
                    
                    <div className="flex items-center space-x-3 p-2 rounded-md hover:bg-white/60 transition-colors">
                      <Checkbox
                        id="account-unhealthy"
                        checked={showAccountUnhealthy}
                        onCheckedChange={(checked) => setShowAccountUnhealthy(checked as boolean)}
                      />
                      <label htmlFor="account-unhealthy" className="flex items-center gap-2 text-sm font-medium cursor-pointer flex-1">
                        <div className="w-3 h-3 rounded-full bg-red-500 shadow-sm"></div>
                        <span className="text-slate-700">Overloaded</span>
                        <span className="text-xs text-slate-500 ml-auto">&gt; {accountThreshold} accounts</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {(searchQuery || !showRevenueHealthy || !showRevenueUnhealthy || !showAccountHealthy || !showAccountUnhealthy) && (
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                  <p className="text-sm text-blue-700 font-medium">
                    Showing {filteredSellers.length} seller{filteredSellers.length !== 1 ? 's' : ''}
                    {searchQuery && ` matching "${searchQuery}"`}
                    {(!showRevenueHealthy || !showRevenueUnhealthy || !showAccountHealthy || !showAccountUnhealthy) && ' (filtered by performance)'}
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
                  <div className="text-2xl font-bold">{displayEnterpriseKPIs.accountCount}</div>
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
                  <div className="text-2xl font-bold">{displayEnterpriseKPIs.sellerCount}</div>
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
                          <CardDescription className="text-xs">
                            {seller.manager?.name || "No Manager"}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <p className="text-sm text-muted-foreground">
                                {seller.accountCount} accounts
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
                  <div className="text-2xl font-bold">{displayMidmarketKPIs.accountCount}</div>
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
                  <div className="text-2xl font-bold">{displayMidmarketKPIs.sellerCount}</div>
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
                          <CardDescription className="text-xs">
                            {seller.manager?.name || "No Manager"}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <p className="text-sm text-muted-foreground">
                                {seller.accountCount} accounts
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
                                <span className="font-medium">{count}</span>
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
