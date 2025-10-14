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
import { Search, ChevronDown, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useAudit } from "@/hooks/use-audit";
import { PageLoader, DataLoader } from "@/components/ui/loader";
import { LoadingTimeout } from "@/components/ui/loading-timeout";
import { 
  getUnifiedDashboardData,
  getManagerDashboardData,
  getMasterDashboardData
} from "@/lib/unified-dashboard-query";
import { getManagerPerformance } from "@/lib/optimized-queries";
import { useRealtimeDashboard } from "@/hooks/use-realtime-dashboard";

// Professional Multi-Select Dropdown Component
interface MultiSelectDropdownProps {
  label: string;
  placeholder: string;
  options: { value: string; label: string; icon?: React.ReactNode }[];
  selectedValues: string[];
  onSelectionChange: (values: string[]) => void;
  className?: string;
}

function MultiSelectDropdown({ 
  label, 
  placeholder, 
  options, 
  selectedValues, 
  onSelectionChange,
  className = ""
}: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);

  const handleSelect = (value: string) => {
    const newSelection = selectedValues.includes(value)
      ? selectedValues.filter(v => v !== value)
      : [...selectedValues, value];
    onSelectionChange(newSelection);
  };

  const handleClear = () => {
    onSelectionChange([]);
  };

  const handleSelectAll = () => {
    onSelectionChange(options.map(opt => opt.value));
  };

  const selectedLabels = selectedValues.map(value => 
    options.find(opt => opt.value === value)?.label
  ).filter(Boolean);

  return (
    <div className={`space-y-2 ${className}`}>
      <label className="text-sm font-medium text-slate-700">{label}</label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between text-left font-normal hover:bg-slate-50 hover:border-slate-300 focus:ring-2 focus:ring-slate-200 focus:border-slate-300"
          >
            <div className="flex items-center gap-2 flex-wrap">
              {selectedValues.length === 0 ? (
                <span className="text-muted-foreground">{placeholder}</span>
              ) : selectedValues.length === options.length ? (
                <span className="text-slate-600">All selected</span>
              ) : (
                <div className="flex items-center gap-1 flex-wrap">
                  {selectedLabels.slice(0, 2).map((label, index) => (
                    <Badge key={index} variant="secondary" className="text-xs">
                      {label}
                    </Badge>
                  ))}
                  {selectedLabels.length > 2 && (
                    <Badge variant="secondary" className="text-xs">
                      +{selectedLabels.length - 2} more
                    </Badge>
                  )}
                </div>
              )}
            </div>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <Command>
            <CommandInput placeholder={`Search ${label.toLowerCase()}...`} />
            <CommandList>
              <CommandEmpty>No options found.</CommandEmpty>
              <CommandGroup>
                <div className="flex items-center justify-between p-2 border-b">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSelectAll}
                    className="h-8 text-xs"
                  >
                    Select All
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClear}
                    className="h-8 text-xs"
                  >
                    Clear All
                  </Button>
                </div>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onSelect={() => handleSelect(option.value)}
                    className="flex items-center space-x-2"
                  >
                    <Checkbox
                      checked={selectedValues.includes(option.value)}
                      className="mr-2"
                    />
                    {option.icon && <span className="mr-2">{option.icon}</span>}
                    <span>{option.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// Import functionality moved to Settings page

export default function DashboardPage() {
  const { profile, user, loading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { logEvent } = useAudit();
  const router = useRouter();

  // Enable real-time updates - listens for changes across all users and tabs
  useRealtimeDashboard();

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
  
  // Professional multi-select filter states
  const [revenueFilters, setRevenueFilters] = useState<string[]>(["healthy", "unhealthy"]);
  const [accountFilters, setAccountFilters] = useState<string[]>(["healthy", "unhealthy"]);
  const [seniorityFilters, setSeniorityFilters] = useState<string[]>(["junior", "senior"]);
  const [divisionFilters, setDivisionFilters] = useState<string[]>(["ESG", "GDT", "GVC", "MSG_US"]);
  const [completionFilters, setCompletionFilters] = useState<string[]>(["completed", "not-completed"]);
  const [selectedManagers, setSelectedManagers] = useState<string[]>([]);
  const [managerFilters, setManagerFilters] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string>("enterprise");

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
      }
    };

    fetchSettings();
  }, []);

  // Fetch unified dashboard data - replaces all 6 separate queries
  const { data: unifiedData = [], isLoading: unifiedDataLoading } = useQuery({
    queryKey: ["unified-dashboard", profile?.role, profile?.id],
    queryFn: async () => {
      if (profile?.role === "MANAGER") {
        return await getManagerDashboardData(profile.id);
      } else {
        return await getMasterDashboardData();
      }
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Fetch manager performance data
  const { data: managerPerformanceData = [], isLoading: isManagerLoading } = useQuery({
    queryKey: ['manager-performance'],
    queryFn: getManagerPerformance,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Process unified data - all calculations are already done in the materialized view
  const sellerRevenues = (Array.isArray(unifiedData) ? unifiedData : []).map((seller: any) => {
    return {
      id: seller.seller_id,
      name: seller.seller_name,
      division: seller.division,
      size: seller.size,
      tenure_months: seller.tenure_months,
      seniority_type: seller.seniority_type,
      industry_specialty: seller.industry_specialty,
      book_finalized: seller.book_finalized,
      manager: {
        name: seller.manager_name,
        id: seller.manager_id
      },
      all_manager_ids: seller.all_manager_ids || [],
      all_manager_names: seller.all_manager_names || [],
      accountCount: seller.account_count,
      totalRevenue: seller.total_revenue,
      isRevenueHealthy: seller.is_revenue_healthy,
      isAccountCountHealthy: seller.is_account_healthy,
      hasSizeMismatch: seller.size_mismatch_type !== null && seller.size_mismatch_type !== '',
      mismatchedAccountCount: seller.size_mismatch_count || 0,
      mismatchType: seller.size_mismatch_type || '',
      hasIndustryMismatch: seller.has_industry_mismatch,
      industryMismatchedAccountCount: seller.industry_mismatch_count || 0,
    };
  });

  // Filter sellers based on search query and all filters
  const filteredSellers = sellerRevenues.filter(seller => {
    // Text search filter
    const matchesSearch = seller.name.toLowerCase().includes(searchQuery.toLowerCase());
    
    // Health indicator filters
    const matchesRevenueFilter = 
      (revenueFilters.includes("healthy") && seller.isRevenueHealthy) || 
      (revenueFilters.includes("unhealthy") && !seller.isRevenueHealthy);
    
    const matchesAccountFilter = 
      (accountFilters.includes("healthy") && seller.isAccountCountHealthy) || 
      (accountFilters.includes("unhealthy") && !seller.isAccountCountHealthy);
    
    // Seniority filter using seniority_type column
    const matchesSeniorityFilter = 
      (seniorityFilters.includes("junior") && seller.seniority_type === "junior") || 
      (seniorityFilters.includes("senior") && seller.seniority_type === "senior");
    
    // Division filter
    const matchesDivisionFilter = divisionFilters.includes(seller.division);
    
    // Completion status filter
    const isCompleted = seller.book_finalized === true;
    const matchesCompletionFilter = 
      (completionFilters.includes("completed") && isCompleted) || 
      (completionFilters.includes("not-completed") && !isCompleted);
    
    // Manager filter - check if any of the seller's managers are in the filter
    const matchesManagerFilter = 
      managerFilters.length === 0 || 
      (seller.all_manager_ids && seller.all_manager_ids.some((managerId: string) => managerFilters.includes(managerId)));
    
    return matchesSearch && matchesRevenueFilter && matchesAccountFilter && matchesSeniorityFilter && matchesDivisionFilter && matchesCompletionFilter && matchesManagerFilter;
  });

  // Calculate KPIs by size using filtered sellers
  const calculateKPIs = (size: "enterprise" | "midmarket") => {
    const sizeSellers = filteredSellers.filter(s => s.size === size);
    
    // Calculate totals from filtered sellers
    const totalRevenue = sizeSellers.reduce((sum, seller) => sum + (seller.totalRevenue || 0), 0);
    const totalAccounts = sizeSellers.reduce((sum, seller) => sum + (seller.accountCount || 0), 0);
    
    const avgRevenue = totalAccounts > 0 ? totalRevenue / totalAccounts : 0;

    return {
      accountCount: totalAccounts,
      sellerCount: sizeSellers.length,
      totalRevenue: totalRevenue,
      avgRevenue: avgRevenue,
    };
  };

  const enterpriseKPIs = calculateKPIs("enterprise");
  const midmarketKPIs = calculateKPIs("midmarket");

  // Use manager performance data from materialized view
  const managerPerformance = (Array.isArray(managerPerformanceData) ? managerPerformanceData : [])
    .map((manager: any) => ({
      id: manager.manager_id,
      name: manager.manager_name,
      sellerCount: manager.seller_count || 0,
      totalAccounts: manager.total_accounts || 0,
      totalRevenue: manager.total_revenue || 0,
      enterpriseAccounts: manager.enterprise_sellers || 0,
      midmarketAccounts: manager.midmarket_sellers || 0,
      enterpriseRevenue: 0, // This would need to be calculated separately if needed
      midmarketRevenue: 0, // This would need to be calculated separately if needed
      divisionCounts: {
        ESG: manager.esg_sellers || 0,
        GDT: manager.gdt_sellers || 0,
        GVC: manager.gvc_sellers || 0,
        MSG_US: manager.msg_sellers || 0,
        MIXED: manager.mixed_sellers || 0,
      },
      avgRevenuePerAccount: manager.total_accounts > 0 ? manager.total_revenue / manager.total_accounts : 0,
    }));


  // Determine if filters are active
  const filtersActive = searchQuery || 
    revenueFilters.length < 2 || 
    accountFilters.length < 2 ||
    seniorityFilters.length < 2 ||
    divisionFilters.length < 4 ||
    completionFilters.length < 2;

  // KPIs now automatically use filteredSellers, so they update with filters
  const displayEnterpriseKPIs = enterpriseKPIs;
  const displayMidmarketKPIs = midmarketKPIs;

  // Initialize finalized sellers state from database
  useEffect(() => {
    if (unifiedData.length > 0) {
      const finalizedIds = new Set(
        (Array.isArray(unifiedData) ? unifiedData : [])
          .filter(seller => seller.book_finalized)
          .map(seller => seller.seller_id)
      );
      setFinalizedSellers(finalizedIds);
    }
  }, [unifiedData]);

  // Restore active tab from localStorage on mount
  useEffect(() => {
    const savedTab = localStorage.getItem('dashboardActiveTab');
    if (savedTab) {
      setActiveTab(savedTab);
      // Clear it after restoring to prevent persisting across sessions
      localStorage.removeItem('dashboardActiveTab');
    }
  }, []);

  // Function to handle tab change and save to localStorage
  const handleTabChange = (value: string) => {
    setActiveTab(value);
  };

  // Handle checkbox change for finalized status
  const handleFinalizedChange = async (sellerId: string, finalized: boolean) => {
    try {
      // Get seller info for audit log
      const seller = Array.isArray(unifiedData) ? unifiedData.find(s => s.seller_id === sellerId) : undefined;
      
      const { error } = await supabase
        .from("sellers")
        .update({ book_finalized: finalized })
        .eq("id", sellerId);

      if (error) {
        throw error;
      }
      

      // Log audit event
      await logEvent(
        finalized ? 'book_finalized' : 'book_unfinalized',
        'seller',
        sellerId,
        { book_finalized: !finalized },
        { 
          book_finalized: finalized,
          seller_name: seller?.seller_name,
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

      // Refresh the materialized view to reflect changes
      await supabase.rpc('refresh_performance_views');
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["unified-dashboard"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["manager-performance"] });

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

  // Combined loading state for unified data fetching
  const isDataLoading = unifiedDataLoading || isManagerLoading;

  // Show loading state while authentication is being checked or data is loading
  if (loading || isDataLoading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="container mx-auto p-6">
          <LoadingTimeout timeout={20000}>
            <PageLoader text={loading ? "Authenticating..." : "Loading dashboard data..."} />
          </LoadingTimeout>
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
              Seller Management
            </CardTitle>
            <CardDescription>
              Search and filter sellers by performance metrics. Revenue and account health indicators are automatically calculated based on size (midmarket/enterprise) and experience level (junior/senior).
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
            
            {/* Professional Multi-Select Filter System */}
            <div className="mt-6 bg-white border border-slate-200 rounded-lg shadow-sm">
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-slate-100 rounded-md">
                      <TrendingUp className="h-4 w-4 text-slate-600" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-slate-900">Performance Filters</h3>
                      <p className="text-sm text-slate-500">Filter sellers by performance indicators and team attributes</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setRevenueFilters(["healthy", "unhealthy"]);
                        setAccountFilters(["healthy", "unhealthy"]);
                        setSeniorityFilters(["junior", "senior"]);
                        setDivisionFilters(["ESG", "GDT", "GVC", "MSG_US"]);
                        setCompletionFilters(["completed", "not-completed"]);
                        setManagerFilters([]);
                      }}
                      className="text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                    >
                      Reset All
                    </Button>
                  </div>
                </div>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-6">
                  {/* Revenue Performance Filter */}
                  <MultiSelectDropdown
                    label="Revenue Performance"
                    placeholder="Select revenue status..."
                    options={[
                      { 
                        value: "healthy", 
                        label: "Healthy Revenue", 
                        icon: <div className="w-2 h-2 rounded-full bg-green-500"></div>
                      },
                      { 
                        value: "unhealthy", 
                        label: "Needs Attention", 
                        icon: <div className="w-2 h-2 rounded-full bg-red-500"></div>
                      }
                    ]}
                    selectedValues={revenueFilters}
                    onSelectionChange={setRevenueFilters}
                  />

                  {/* Account Load Filter */}
                  <MultiSelectDropdown
                    label="Account Load"
                    placeholder="Select account status..."
                    options={[
                      { 
                        value: "healthy", 
                        label: "Manageable Load", 
                        icon: <div className="w-2 h-2 rounded-full bg-green-500"></div>
                      },
                      { 
                        value: "unhealthy", 
                        label: "Overloaded", 
                        icon: <div className="w-2 h-2 rounded-full bg-red-500"></div>
                      }
                    ]}
                    selectedValues={accountFilters}
                    onSelectionChange={setAccountFilters}
                  />

                  {/* Experience Level Filter */}
                  <MultiSelectDropdown
                    label="Experience Level"
                    placeholder="Select experience..."
                    options={[
                      { 
                        value: "junior", 
                        label: "Junior", 
                        icon: <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                      },
                      { 
                        value: "senior", 
                        label: "Senior", 
                        icon: <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                      }
                    ]}
                    selectedValues={seniorityFilters}
                    onSelectionChange={setSeniorityFilters}
                  />

                  {/* Division Filter */}
                  <MultiSelectDropdown
                    label="Business Division"
                    placeholder="Select divisions..."
                    options={[
                      { 
                        value: "ESG", 
                        label: "ESG", 
                        icon: <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                      },
                      { 
                        value: "GDT", 
                        label: "GDT", 
                        icon: <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                      },
                      { 
                        value: "GVC", 
                        label: "GVC", 
                        icon: <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                      },
                      { 
                        value: "MSG_US", 
                        label: "MSG US", 
                        icon: <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                      },
                    ]}
                    selectedValues={divisionFilters}
                    onSelectionChange={setDivisionFilters}
                  />

                  {/* Completion Status Filter */}
                  <MultiSelectDropdown
                    label="Completion Status"
                    placeholder="Select status..."
                    options={[
                      { 
                        value: "completed", 
                        label: "Book finalized", 
                        icon: <div className="w-2 h-2 rounded-full bg-green-500"></div>
                      },
                      { 
                        value: "not-completed", 
                        label: "Book not finalized", 
                        icon: <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                      }
                    ]}
                    selectedValues={completionFilters}
                    onSelectionChange={setCompletionFilters}
                  />

                  {/* Manager Filter */}
                  <MultiSelectDropdown
                    label="Manager"
                    placeholder="Select managers..."
                    options={managerPerformance.map(manager => ({
                      value: manager.id,
                      label: (manager as any).name || 'NA',
                      icon: <Users className="h-4 w-4" />
                    }))}
                    selectedValues={managerFilters}
                    onSelectionChange={setManagerFilters}
                  />
                </div>
                
                {/* Filter Summary */}
                <div className="mt-6 pt-4 border-t border-slate-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Users className="h-4 w-4" />
                      <span>Showing {filteredSellers.length} of {unifiedData.length} sellers</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span className="px-2 py-1 bg-slate-100 rounded text-slate-600">
                        Revenue: {revenueFilters.length === 2 ? 'All' : revenueFilters.includes('healthy') ? 'Healthy' : 'Needs attention'}
                      </span>
                      <span className="px-2 py-1 bg-slate-100 rounded text-slate-600">
                        Experience: {seniorityFilters.length === 2 ? 'All' : seniorityFilters.includes('junior') ? 'Junior' : 'Senior'}
                      </span>
                      <span className="px-2 py-1 bg-slate-100 rounded text-slate-600">
                        Division: {divisionFilters.length === 4 ? 'All' : `${divisionFilters.length} selected`}
                      </span>
                      <span className="px-2 py-1 bg-slate-100 rounded text-slate-600">
                        Status: {completionFilters.length === 2 ? 'All' : completionFilters.includes('completed') ? 'Completed' : 'In Progress'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {filtersActive && (
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                  <p className="text-sm text-blue-700 font-medium">
                    Showing {filteredSellers.length} seller{filteredSellers.length !== 1 ? 's' : ''}
                    {searchQuery && ` matching "${searchQuery}"`}
                    {filtersActive && ' (filtered by performance and status)'}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* KPI Tabs */}
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
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
                    ${displayEnterpriseKPIs.totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
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
                      <Card key={seller.id} className="transition-all hover:shadow-lg hover:scale-[1.02] flex flex-col">
                        <CardHeader className="flex-grow">
                          <div className="flex items-start justify-between">
                            <CardTitle className="text-base">{seller.name}</CardTitle>
                            <DivisionBadge division={seller.division} />
                          </div>
                          <CardDescription className="text-xs">
                            Supervisor: {seller.manager?.name || "No Manager"}
                          </CardDescription>
                          {/* Seniority Badge */}
                          <div className="flex items-center gap-2">
                              <Badge 
                                variant={seller.seniority_type === 'senior' ? 'default' : 'outline'}
                                className={`text-xs ${
                                  seller.seniority_type === 'senior'
                                    ? 'bg-green-100 text-green-700 border-green-200' 
                                    : 'bg-orange-100 text-orange-700 border-orange-200'
                                }`}
                              >
                                <Star className="h-3 w-3 mr-1" />
                                {seller.seniority_type === 'senior' ? 'Senior' : 'Junior'}
                              </Badge>
                            </div>
                          <div className="flex flex-col gap-1 mb-2">
                            {/* Red Flag - positioned above seniority badge */}
                            {seller.hasSizeMismatch && seller.mismatchedAccountCount > 0 && (
                              <div className="flex items-center gap-1 text-red-600 font-bold text-[10px] bg-red-50 px-1.5 py-0.5 rounded border border-red-200 w-fit">
                                <span>🚩</span>
                                <span>
                                  {seller.size === 'enterprise' 
                                    ? `Has ${seller.mismatchedAccountCount} MM account(s)`
                                    : `Has ${seller.mismatchedAccountCount} ENT account(s)`
                                  }
                                </span>
                              </div>
                            )}
                            {/* Yellow Flag - industry mismatch - below red flag */}
                            {seller.hasIndustryMismatch && seller.industry_specialty && seller.industry_specialty !== "-" && (
                              <div className="flex items-center gap-1 text-yellow-700 font-bold text-[10px] bg-yellow-50 px-1.5 py-0.5 rounded border border-yellow-200 w-fit">
                                <span>⚠️</span>
                                <span>{seller.industryMismatchedAccountCount} account(s) with industry mismatch</span>
                              </div>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent className="flex flex-col space-y-3">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <p className="text-base font-semibold text-black">
                                {seller.accountCount || 0} accounts
                              </p>
                              <div className={`w-2 h-2 rounded-full ${seller.isAccountCountHealthy ? 'bg-green-500' : 'bg-red-500'}`} />
                            </div>
                            <div className="flex items-center justify-between">
                              <p className="text-base font-semibold text-black">
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
                          <Link 
                            href={`/sellers/${seller.id}`} 
                            className="block mt-auto"
                            onClick={() => localStorage.setItem('dashboardActiveTab', activeTab)}
                          >
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
                    ${displayMidmarketKPIs.totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
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
                      <Card key={seller.id} className="transition-all hover:shadow-lg hover:scale-[1.02] flex flex-col">
                        <CardHeader className="flex-grow">
                          <div className="flex items-start justify-between">
                            <CardTitle className="text-base">{seller.name}</CardTitle>
                            <DivisionBadge division={seller.division} />
                          </div>
                          <CardDescription className="text-xs">
                            Supervisor: {seller.manager?.name || "No Manager"}
                          </CardDescription>
                          {/* Seniority Badge */}
                          <div className="flex items-center gap-2">
                              <Badge 
                                variant={seller.seniority_type === 'senior' ? 'default' : 'outline'}
                                className={`text-xs ${
                                  seller.seniority_type === 'senior'
                                    ? 'bg-green-100 text-green-700 border-green-200' 
                                    : 'bg-orange-100 text-orange-700 border-orange-200'
                                }`}
                              >
                                <Star className="h-3 w-3 mr-1" />
                                {seller.seniority_type === 'senior' ? 'Senior' : 'Junior'}
                              </Badge>
                            </div>
                          <div className="flex flex-col gap-1 mb-2">
                            {/* Red Flag - positioned above seniority badge */}
                            {seller.hasSizeMismatch && seller.mismatchedAccountCount > 0 && (
                              <div className="flex items-center gap-1 text-red-600 font-bold text-[10px] bg-red-50 px-1.5 py-0.5 rounded border border-red-200 w-fit">
                                <span>🚩</span>
                                <span>
                                  {seller.size === 'enterprise' 
                                    ? `Has ${seller.mismatchedAccountCount} MM account(s)`
                                    : `Has ${seller.mismatchedAccountCount} ENT account(s)`
                                  }
                                </span>
                              </div>
                            )}
                            {/* Yellow Flag - industry mismatch - below red flag */}
                            {seller.hasIndustryMismatch && seller.industry_specialty && seller.industry_specialty !== "-" && (
                              <div className="flex items-center gap-1 text-yellow-700 font-bold text-[10px] bg-yellow-50 px-1.5 py-0.5 rounded border border-yellow-200 w-fit">
                                <span>⚠️</span>
                                <span>{seller.industryMismatchedAccountCount} account(s) with industry mismatch</span>
                              </div>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent className="flex flex-col space-y-3">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <p className="text-base font-semibold text-black">
                                {seller.accountCount || 0} accounts
                              </p>
                              <div className={`w-2 h-2 rounded-full ${seller.isAccountCountHealthy ? 'bg-green-500' : 'bg-red-500'}`} />
                            </div>
                            <div className="flex items-center justify-between">
                              <p className="text-base font-semibold text-black">
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
                          <Link 
                            href={`/sellers/${seller.id}`} 
                            className="block mt-auto"
                            onClick={() => localStorage.setItem('dashboardActiveTab', activeTab)}
                          >
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
            {/* Manager Performance Cards */}
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle>Manager Performance</CardTitle>
                <CardDescription>
                  Performance metrics for each manager including total accounts, revenue, and team composition
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Manager Filter */}
                <div className="mb-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <MultiSelectDropdown
                        label="Filter by Manager"
                        placeholder="Select managers to filter..."
                        options={managerPerformance.map(manager => ({
                          value: manager.id,
                          label: (manager as any).name || 'NA',
                          icon: <Users className="h-4 w-4" />
                        }))}
                        selectedValues={selectedManagers}
                        onSelectionChange={setSelectedManagers}
                        className="w-full max-w-md"
                      />
                      {selectedManagers.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedManagers([])}
                          className="text-xs"
                        >
                          Clear All
                        </Button>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {selectedManagers.length === 0 
                        ? `Showing all ${managerPerformance.length} managers`
                        : `Showing ${managerPerformance.filter(manager => selectedManagers.includes(manager.id)).length} of ${managerPerformance.length} managers`
                      }
                    </div>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {managerPerformance
                    .filter(manager => 
                      selectedManagers.length === 0 || selectedManagers.includes(manager.id)
                    )
                    .map(manager => (
                    <Card key={manager.id} className="transition-all hover:shadow-lg hover:scale-[1.02]">
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <CardTitle className="text-base">{(manager as any).name || 'NA'}</CardTitle>
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
