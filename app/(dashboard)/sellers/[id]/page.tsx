'use client'

import { useParams, useRouter } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Loader2, Building2, LockIcon, DollarSign, Map, Calendar, Search } from "lucide-react";
import React, { useEffect, useState, memo, useMemo, Suspense, lazy } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { DndContext, DragEndEvent, DragOverlay, useSensor, useSensors, PointerSensor, useDraggable, useDroppable, DragStartEvent } from "@dnd-kit/core";
import { restrictToWindowEdges } from "@dnd-kit/modifiers";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { PinButton } from "@/components/seller/PinButton";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useAudit } from "@/hooks/use-audit";

// Import chart components directly for better performance
import { DivisionChart, StateChart, IndustryChart } from "@/components/charts/RevenueCharts";

type Account = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  industry: string | null;
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
};

type DroppableZone = "original" | "must_keep" | "for_discussion" | "to_be_peeled" | "available";

// Calculate distance between two geographic points using Haversine formula
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Calculate fit percentage for a single account
function calculateFitPercentage(account: Account, seller: Seller | null): number {
  if (!seller) return 0;

  let totalScore = 0;
  let maxPossibleScore = 0;

  // 1. Division Overlap (40% weight)
  maxPossibleScore += 40;
  if (account.current_division === seller.division) {
    totalScore += 40;
  }

  // 2. Geographic Proximity (25% weight) - For Midmarket sellers
  maxPossibleScore += 25;
  if (seller.size === 'midmarket' && seller.lat && seller.lng && account.lat && account.lng) {
    const distance = calculateDistance(seller.lat, seller.lng, account.lat, account.lng);
    // Closer is better - normalize distance (0-1000 miles range)
    const proximityScore = Math.max(0, 25 - (distance / 40)); // 40 miles = 1 point reduction
    totalScore += proximityScore;
  } else if (seller.size === 'midmarket') {
    // If seller is midmarket but no location data, give partial credit
    totalScore += 12.5;
  } else {
    // For enterprise sellers, give full credit for geographic (they may travel more)
    totalScore += 25;
  }

  // 3. Industry Matching (20% weight)
  maxPossibleScore += 20;
  if (seller.industry_specialty && account.industry) {
    const industryMatch = account.industry.toLowerCase().includes(seller.industry_specialty.toLowerCase()) ||
                         seller.industry_specialty.toLowerCase().includes(account.industry.toLowerCase());
    if (industryMatch) {
      totalScore += 20;
    }
  } else {
    // If no industry data, give partial credit
    totalScore += 10;
  }

  // 4. Revenue Potential (10% weight) - Normalized
  maxPossibleScore += 10;
  const revenueScore = Math.min(10, Math.log10(account.total_revenue + 1) * 2);
  totalScore += revenueScore;

  // 5. State/Region Matching (5% weight)
  maxPossibleScore += 5;
  if (seller.state && account.state && account.state === seller.state) {
    totalScore += 5;
  }

  return Math.round((totalScore / maxPossibleScore) * 100);
}

// Sophisticated sorting algorithm for available accounts
function sortAvailableAccounts(accounts: Account[], seller: Seller | null): Account[] {
  if (!seller) return accounts;

  // Calculate fit percentage for each account and add it to the account object
  const accountsWithFit = accounts.map(account => ({
    ...account,
    fitPercentage: calculateFitPercentage(account, seller)
  }));

  return accountsWithFit.sort((a, b) => {
    // Primary sort by fit percentage (highest first)
    if (a.fitPercentage !== b.fitPercentage) {
      return b.fitPercentage - a.fitPercentage;
    }
    
    // Secondary sort by revenue (highest first) for accounts with same fit
    return b.total_revenue - a.total_revenue;
  });
}

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
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  
  // Account search state
  const [accountSearchQuery, setAccountSearchQuery] = useState("");
  
  // Book finalized state
  const [isBookFinalized, setIsBookFinalized] = useState(false);
  
  // Thresholds for visual indicators (will be fetched from database)
  const [revenueThreshold, setRevenueThreshold] = useState(10_000_000);
  const [accountThreshold, setAccountThreshold] = useState(5);

  // Memoize expensive calculations - MUST be before any conditional returns
  const uniqueStates = useMemo(() => {
    return new Set(
      mustKeepAccounts
        .map(a => a.state)
        .filter(state => state !== null && state !== undefined && state !== '')
    );
  }, [mustKeepAccounts]);
  
  const uniqueIndustries = useMemo(() => {
    return new Set(
      mustKeepAccounts
        .map(a => a.industry)
        .filter(industry => industry !== null && industry !== undefined && industry !== '')
    );
  }, [mustKeepAccounts]);
  
  const uniqueDivisions = useMemo(() => {
    return new Set(
      mustKeepAccounts
        .map(a => a.current_division)
        .filter(division => division !== null && division !== undefined && division !== '')
    );
  }, [mustKeepAccounts]);

  // Fetch seller total revenue from the centralized view
  const { data: revenueData } = useQuery({
    queryKey: ["sellerRevenue", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("seller_revenue_view")
        .select("seller_total_revenue")
        .eq("seller_id", id)
        .maybeSingle();
      
      if (error) throw error;
      return Number(data?.seller_total_revenue) || 0;
    },
    enabled: !!id && authorized,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 3, // Reduced distance for more responsive dragging
      },
    })
  );

  // Fetch threshold settings - MUST be called before any conditional logic
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
        const { data: seller } = await supabase
          .from("sellers")
          .select("id, manager_id")
          .eq("id", id)
          .maybeSingle();

        if (!seller) {
          toast({
            title: "Seller not found",
            description: "The requested seller does not exist.",
            variant: "destructive",
          });
          router.push("/dashboard");
          return;
        }

        const { data: mgr } = await supabase
          .from("managers")
          .select("user_id")
          .eq("id", seller.manager_id ?? "")
          .maybeSingle();

        if (mgr?.user_id === profile.id) {
          setAuthorized(true);
        } else {
          toast({
            title: "Access denied",
            description: "You do not manage this seller.",
            variant: "destructive",
          });
          router.push("/dashboard");
          return;
        }
      }

      setChecking(false);
    })();
  }, [id, profile, router, toast]);

  useEffect(() => {
    if (!authorized) return;
    
    const fetchData = async () => {
      setLoading(true);
      
      const { data: sellerData } = await supabase
        .from("sellers")
        .select("id, name, division, city, state, tenure_months, size, industry_specialty, lat, lng, book_finalized")
        .eq("id", id)
        .single();
      
      if (sellerData) {
        setSeller(sellerData);
        setIsBookFinalized(sellerData.book_finalized || false);
      }

      // Fetch original relationships (immutable snapshot)
      const { data: originalRelationships } = await supabase
        .from("original_relationships")
        .select(`
          account_id,
          pct_esg,
          pct_gdt,
          pct_gvc,
          pct_msg_us,
          accounts (
            id,
            name,
            city,
            state,
            industry,
            current_division,
            lat,
            lng
          )
        `)
        .eq("seller_id", id);

      // Fetch current relationships
      const { data: relationships } = await supabase
        .from("relationship_maps")
        .select(`
          account_id,
          status,
          last_actor_user_id,
          pct_esg,
          pct_gdt,
          pct_gvc,
          pct_msg_us,
          accounts (
            id,
            name,
            city,
            state,
            industry,
            current_division,
            lat,
            lng
          )
        `)
        .eq("seller_id", id)
        .in("status", ["must_keep", "for_discussion", "to_be_peeled", "approval_for_pinning", "approval_for_assigning", "pinned", "assigned", "up_for_debate", "peeled"]);

      const { data: revenues } = await supabase
        .from("account_revenues")
        .select("*");

      // Process original accounts with weighted revenue
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

          // Apply weighted calculation using percentages
          const breakdown = {
            esg: fullRevenue.esg * Number(r.pct_esg || 0) / 100,
            gdt: fullRevenue.gdt * Number(r.pct_gdt || 0) / 100,
            gvc: fullRevenue.gvc * Number(r.pct_gvc || 0) / 100,
            msg_us: fullRevenue.msg_us * Number(r.pct_msg_us || 0) / 100,
          };

          const total_revenue = breakdown.esg + breakdown.gdt + breakdown.gvc + breakdown.msg_us;
          const full_total_revenue = fullRevenue.esg + fullRevenue.gdt + fullRevenue.gvc + fullRevenue.msg_us;
          
          return {
            ...account,
            total_revenue,
            full_total_revenue,
            revenue_breakdown: breakdown,
            full_revenue_breakdown: fullRevenue,
            isOriginal: true,
          };
        })
        .filter(Boolean) || [];

      // Process currently assigned accounts with weighted revenue
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

          // Apply weighted calculation using percentages
          const breakdown = {
            esg: fullRevenue.esg * Number(r.pct_esg || 0) / 100,
            gdt: fullRevenue.gdt * Number(r.pct_gdt || 0) / 100,
            gvc: fullRevenue.gvc * Number(r.pct_gvc || 0) / 100,
            msg_us: fullRevenue.msg_us * Number(r.pct_msg_us || 0) / 100,
          };

          const total_revenue = breakdown.esg + breakdown.gdt + breakdown.gvc + breakdown.msg_us;
          const full_total_revenue = fullRevenue.esg + fullRevenue.gdt + fullRevenue.gvc + fullRevenue.msg_us;
          
          return {
            ...account,
            total_revenue,
            full_total_revenue,
            revenue_breakdown: breakdown,
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

      const assignedIds = [...originalAccountsWithRevenue, ...assignedAccountsWithRevenue].map((a: Account) => a.id);
      
      // Get all accounts that are currently assigned to ANY seller with restricted statuses (GLOBAL)
      const { data: restrictedAccounts } = await supabase
        .from("relationship_maps")
        .select("account_id")
        .in("status", ["must_keep", "for_discussion", "to_be_peeled", "pinned", "assigned", "up_for_debate", "approval_for_pinning", "approval_for_assigning", "peeled"]);
      
      const restrictedAccountIds = restrictedAccounts?.map(r => r.account_id) || [];
      
      // Get accounts with "available" status from ANY seller (GLOBAL)
      const { data: availableFromAnySeller } = await supabase
        .from("relationship_maps")
        .select(`
          account_id,
          accounts (
            id, 
            name, 
            city, 
            state, 
            industry, 
            current_division,
            lat,
            lng
          )
        `)
        .eq("status", "available");
      
      const { data: allAccounts } = await supabase
        .from("accounts")
        .select(`
          id, 
          name, 
          city, 
          state, 
          industry, 
          current_division,
          lat,
          lng
        `);

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
      const { data: allAssignedAccounts } = await supabase
        .from("relationship_maps")
        .select("account_id");
      
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

      // Sort available accounts using sophisticated ranking algorithm
      const sortedAvailable = sortAvailableAccounts(allAvailableAccounts, sellerData);
      
      setAvailableAccounts(sortedAvailable);
      setLoading(false);
    };

    fetchData();
  }, [authorized, id]);

  const handleDragStart = (event: DragEndEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || !seller) return;

    const accountId = active.id as string;
    const targetZone = over.id as DroppableZone;
    const account = [...mustKeepAccounts, ...forDiscussionAccounts, ...toBePeeledAccounts, ...availableAccounts].find(a => a.id === accountId);

    if (!account || targetZone === "original") return;

    const isCurrentlyAssignedToThisSeller = [...mustKeepAccounts, ...forDiscussionAccounts, ...toBePeeledAccounts].some(a => a.id === accountId);
    const isFromAvailablePool = availableAccounts.some(a => a.id === accountId);

    if ((targetZone === "must_keep" && mustKeepAccounts.some(a => a.id === accountId)) || 
        (targetZone === "for_discussion" && forDiscussionAccounts.some(a => a.id === accountId)) ||
        (targetZone === "to_be_peeled" && toBePeeledAccounts.some(a => a.id === accountId)) ||
        (targetZone === "available" && !isCurrentlyAssignedToThisSeller && !isFromAvailablePool)) {
      return;
    }

    // Only prevent moving original accounts to available (they are immutable)
    if (targetZone === "available" && isCurrentlyAssignedToThisSeller) {
      const currentAccount = [...mustKeepAccounts, ...forDiscussionAccounts, ...toBePeeledAccounts].find(a => a.id === accountId);
      if (currentAccount && currentAccount.isOriginal) {
        toast({
          title: "Cannot unassign account",
          description: `Account "${account.name}" is an original account and cannot be unassigned.`,
          variant: "destructive",
        });
        return;
      }
    }

    const isAssigning = targetZone !== "available";
    const isMovingBetweenColumns = isCurrentlyAssignedToThisSeller && isAssigning;

    if (profile?.role === "MASTER") {
      if (isAssigning) {
        if (isMovingBetweenColumns) {
          // Update existing relationship
          const { error } = await supabase
            .from("relationship_maps")
            .update({ 
              status: targetZone,
              last_actor_user_id: profile.id 
            })
            .eq("account_id", accountId)
            .eq("seller_id", id);

          if (error) {
            toast({
              title: "Error",
              description: "Failed to update account status",
              variant: "destructive",
            });
            return;
          }

          // Log audit event for status change
          const auditData = {
            account_id: accountId,
            seller_id: id,
            status: targetZone,
            last_actor_user_id: profile.id,
            account_name: account.name,
            seller_name: seller.name,
          };
          await logUpdate("relationship", accountId, { status: account.status }, { status: targetZone });

          // Update state arrays - remove from current and add to target
          const accountWithStatus = { ...account, status: targetZone };
          
          // Remove from current arrays and add to target array in one operation
          setMustKeepAccounts(prev => {
            const filtered = prev.filter(a => a.id !== accountId);
            return targetZone === 'must_keep' ? [...filtered, accountWithStatus] : filtered;
          });
          
          setForDiscussionAccounts(prev => {
            const filtered = prev.filter(a => a.id !== accountId);
            return targetZone === 'for_discussion' ? [...filtered, accountWithStatus] : filtered;
          });
          
          setToBePeeledAccounts(prev => {
            const filtered = prev.filter(a => a.id !== accountId);
            return targetZone === 'to_be_peeled' ? [...filtered, accountWithStatus] : filtered;
          });
          
          queryClient.invalidateQueries({ queryKey: ["sellerRevenue"] });
          
          toast({
            title: "Account status updated",
            description: `${account.name} has been moved to ${targetZone.replace('_', ' ')}`,
          });
        } else {
          // Create new relationship (from available pool)
          const divisionMap: Record<string, { pct_esg: number; pct_gdt: number; pct_gvc: number; pct_msg_us: number }> = {
            "ESG": { pct_esg: 100, pct_gdt: 0, pct_gvc: 0, pct_msg_us: 0 },
            "GDT": { pct_esg: 0, pct_gdt: 100, pct_gvc: 0, pct_msg_us: 0 },
            "GVC": { pct_esg: 0, pct_gdt: 0, pct_gvc: 100, pct_msg_us: 0 },
            "MSG_US": { pct_esg: 0, pct_gdt: 0, pct_gvc: 0, pct_msg_us: 100 },
          };
          
          const percentages = divisionMap[account.current_division] || { pct_esg: 0, pct_gdt: 0, pct_gvc: 0, pct_msg_us: 0 };

          // Check if account is already assigned to another seller with "available" status
          if (account.status === 'available') {
            // Update existing relationship from another seller
            const { error } = await supabase
              .from("relationship_maps")
              .update({
                seller_id: id,
                status: targetZone,
                last_actor_user_id: profile.id,
                ...percentages,
              })
              .eq("account_id", accountId)
              .eq("status", "available");

            if (error) {
              toast({
                title: "Error",
                description: "Failed to reassign account",
                variant: "destructive",
              });
              return;
            }
          } else {
            // Create new relationship for truly unassigned account
            const { error } = await supabase
              .from("relationship_maps")
              .insert({
                account_id: accountId,
                seller_id: id,
                status: targetZone,
                last_actor_user_id: profile.id,
                ...percentages,
              });

            if (error) {
              toast({
                title: "Error",
                description: "Failed to assign account",
                variant: "destructive",
              });
              return;
            }
          }

          // Log audit event for assignment
          const auditData = {
            account_id: accountId,
            seller_id: id,
            status: targetZone,
            last_actor_user_id: profile.id,
            account_name: account.name,
            seller_name: seller.name,
            percentages,
          };
          await logAssign(accountId, auditData);

          // Update the appropriate state based on target zone
          const accountWithStatus = { ...account, status: targetZone };
          
          // Remove from available pool first
          setAvailableAccounts(prev => prev.filter(a => a.id !== accountId));
          
          // Use setTimeout to ensure the removal happens before the addition
          setTimeout(() => {
            if (targetZone === 'must_keep') {
              setMustKeepAccounts(prev => [...prev.filter(a => a.id !== accountId), accountWithStatus]);
            } else if (targetZone === 'for_discussion') {
              setForDiscussionAccounts(prev => [...prev.filter(a => a.id !== accountId), accountWithStatus]);
            } else if (targetZone === 'to_be_peeled') {
              setToBePeeledAccounts(prev => [...prev.filter(a => a.id !== accountId), accountWithStatus]);
            }
          }, 0);
          
          queryClient.invalidateQueries({ queryKey: ["sellerRevenue"] });
          
          toast({
            title: "Account assigned",
            description: `${account.name} has been assigned to ${seller.name}`,
          });
        }
      } else {
        // When moving to available, we need to either delete the relationship OR set status to "available"
        // Let's set the status to "available" instead of deleting, so other sellers can see it
        const { error } = await supabase
          .from("relationship_maps")
          .update({ 
            status: "available",
            last_actor_user_id: profile.id 
          })
          .eq("account_id", accountId)
          .eq("seller_id", id);

        if (error) {
          toast({
            title: "Error",
            description: "Failed to unassign account",
            variant: "destructive",
          });
          return;
        }

        // Log audit event for status change to available
        const auditData = {
          account_id: accountId,
          seller_id: id,
          status: "available",
          last_actor_user_id: profile.id,
          account_name: account.name,
          seller_name: seller.name,
        };
        await logUpdate("relationship", accountId, { status: account.status }, { status: "available" });

        // Update state - move account to available with "available" status
        const accountWithAvailableStatus = { ...account, status: "available" as const };
        
        // Remove from current columns first
        setMustKeepAccounts(prev => prev.filter(a => a.id !== accountId));
        setForDiscussionAccounts(prev => prev.filter(a => a.id !== accountId));
        setToBePeeledAccounts(prev => prev.filter(a => a.id !== accountId));
        
        // Then add to available pool (avoid duplicates)
        setAvailableAccounts(prev => {
          const filtered = prev.filter(a => a.id !== accountId);
          return [...filtered, accountWithAvailableStatus];
        });

        queryClient.invalidateQueries({ queryKey: ["sellerRevenue"] });

        toast({
          title: "Account unassigned",
          description: `${account.name} has been unassigned from ${seller.name}`,
        });
      }
    } else if (profile?.role === "MANAGER") {
      const { error } = await supabase
        .from("requests")
        .insert({
          type: isAssigning ? "assign" : "unassign",
          account_id: accountId,
          target_seller_id: isAssigning ? id : null,
          requester_user_id: profile.id,
          status: "pending",
          reason: isAssigning 
            ? `Request to assign ${account.name} to ${seller.name}`
            : `Request to unassign ${account.name} from ${seller.name}`,
        });

      if (error) {
        toast({
          title: "Error",
          description: "Failed to create request",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Request created",
        description: "Your request has been submitted for approval",
      });
    }
  };


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

  const activeAccount = activeId 
    ? [...mustKeepAccounts, ...forDiscussionAccounts, ...toBePeeledAccounts, ...availableAccounts].find(a => a.id === activeId)
    : null;

  const totalRevenue = revenueData ?? 0;
  const totalAccounts = mustKeepAccounts.length;
  const statesCount = uniqueStates.size;
  
  // Filter accounts based on search query
  const filteredOriginalAccounts = originalAccounts.filter(account =>
    account.name.toLowerCase().includes(accountSearchQuery.toLowerCase()) ||
    account.id.toLowerCase().includes(accountSearchQuery.toLowerCase())
  );
  
  const filteredMustKeepAccounts = mustKeepAccounts.filter(account =>
    account.name.toLowerCase().includes(accountSearchQuery.toLowerCase()) ||
    account.id.toLowerCase().includes(accountSearchQuery.toLowerCase())
  );
  
  const filteredForDiscussionAccounts = forDiscussionAccounts.filter(account =>
    account.name.toLowerCase().includes(accountSearchQuery.toLowerCase()) ||
    account.id.toLowerCase().includes(accountSearchQuery.toLowerCase())
  );
  
  const filteredToBePeeledAccounts = toBePeeledAccounts.filter(account =>
    account.name.toLowerCase().includes(accountSearchQuery.toLowerCase()) ||
    account.id.toLowerCase().includes(accountSearchQuery.toLowerCase())
  );
  
  const filteredAvailableAccounts = availableAccounts.filter(account =>
    account.name.toLowerCase().includes(accountSearchQuery.toLowerCase()) ||
    account.id.toLowerCase().includes(accountSearchQuery.toLowerCase())
  );
  
  // Calculate indicators
  const isRevenueHealthy = totalRevenue >= revenueThreshold;
  const isAccountCountHealthy = totalAccounts <= accountThreshold;
  const location = seller?.city && seller?.state ? `${seller.city}, ${seller.state}` : "N/A";
  const tenure = seller?.tenure_months 
    ? `${Math.floor(seller.tenure_months / 12)}y ${seller.tenure_months % 12}m`
    : "N/A";
  

  // Handle finalized status change
  const handleFinalizedChange = async (finalized: boolean) => {
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
      
      // Invalidate queries to refresh dashboard data
      queryClient.invalidateQueries({ queryKey: ["sellers"] });
      queryClient.invalidateQueries({ queryKey: ["sellerRevenue"] });

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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <AppHeader />
      
      <main className="container mx-auto p-6 space-y-8">
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
              </div>
            </div>
          </div>

          {/* Professional Seller Info Card */}
          {seller && (
            <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 border border-slate-200 shadow-lg mb-8">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Seller Details */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 mb-3">Seller Information</h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-600">Division</span>
                        <Badge variant="secondary" className="px-3 py-1 text-sm font-medium bg-blue-100 text-blue-800 border-blue-200">
                          {seller.division}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-600">Size</span>
                        <span className="text-sm font-medium text-slate-900 capitalize">{seller.size}</span>
                      </div>
                      {seller.industry_specialty && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-600">Industry Specialty</span>
                          <span className="text-sm font-medium text-slate-900">{seller.industry_specialty}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Performance Metrics */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 mb-3">Performance Overview</h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-600">Total Revenue</span>
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
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-600">Total Accounts</span>
                        <span className={`text-lg font-bold ${
                          isAccountCountHealthy ? 'text-green-700' : 'text-red-700'
                        }`}>
                          {totalAccounts}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-600">Geographic Reach</span>
                        <span className="text-lg font-bold text-slate-900">{statesCount} {statesCount === 1 ? 'State' : 'States'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Book Status */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 mb-3">Book Status</h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-600">Status</span>
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${
                            isBookFinalized ? 'bg-green-500' : 'bg-yellow-500'
                          }`}></div>
                          <span className="text-sm font-medium text-slate-900">
                            {isBookFinalized ? 'Finalized' : 'In Progress'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="book-finalized"
                          checked={isBookFinalized}
                          onCheckedChange={(checked) => handleFinalizedChange(checked as boolean)}
                        />
                        <label 
                          htmlFor="book-finalized"
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                        >
                          Mark as finalized
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Professional KPI Dashboard */}
          {seller && (
            <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 border border-slate-200 shadow-lg mb-8">
              <h2 className="text-xl font-semibold text-slate-900 mb-6">Key Performance Indicators</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                {/* Total Accounts KPI */}
                <div className={`rounded-xl p-4 border-2 transition-all ${
                  isAccountCountHealthy 
                    ? 'border-green-200 bg-green-50/50' 
                    : 'border-red-200 bg-red-50/50'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className={`p-2 rounded-lg ${
                      isAccountCountHealthy ? 'bg-green-100' : 'bg-red-100'
                    }`}>
                      <Building2 className={`h-5 w-5 ${
                        isAccountCountHealthy ? 'text-green-600' : 'text-red-600'
                      }`} />
                    </div>
                    <div className={`w-3 h-3 rounded-full ${
                      isAccountCountHealthy ? 'bg-green-500' : 'bg-red-500'
                    }`} />
                  </div>
                  <div className="space-y-1">
                    <p className="text-2xl font-bold text-slate-900">{totalAccounts}</p>
                    <p className="text-sm font-medium text-slate-600">Total Accounts</p>
                    <p className={`text-xs font-medium ${
                      isAccountCountHealthy ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {isAccountCountHealthy ? 'Within limit' : `Over ${accountThreshold} limit`}
                    </p>
                  </div>
                </div>

                {/* Total Revenue KPI */}
                <div className={`rounded-xl p-4 border-2 transition-all ${
                  isRevenueHealthy 
                    ? 'border-green-200 bg-green-50/50' 
                    : 'border-red-200 bg-red-50/50'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className={`p-2 rounded-lg ${
                      isRevenueHealthy ? 'bg-green-100' : 'bg-red-100'
                    }`}>
                      <DollarSign className={`h-5 w-5 ${
                        isRevenueHealthy ? 'text-green-600' : 'text-red-600'
                      }`} />
                    </div>
                    <div className={`w-3 h-3 rounded-full ${
                      isRevenueHealthy ? 'bg-green-500' : 'bg-red-500'
                    }`} />
                  </div>
                  <div className="space-y-1">
                    <p className="text-2xl font-bold text-slate-900">
                      {totalRevenue >= 1_000_000 
                        ? `$${(totalRevenue / 1_000_000).toFixed(1)}M`
                        : totalRevenue >= 1_000 
                        ? `$${(totalRevenue / 1_000).toFixed(0)}K`
                        : `$${totalRevenue.toFixed(0)}`
                      }
                    </p>
                    <p className="text-sm font-medium text-slate-600">Total Revenue</p>
                    <p className={`text-xs font-medium ${
                      isRevenueHealthy ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {isRevenueHealthy ? 'Above threshold' : `Below $${(revenueThreshold / 1_000_000).toFixed(0)}M threshold`}
                    </p>
                  </div>
                </div>

                {/* Geographic Reach KPI */}
                <div className="rounded-xl p-4 border-2 border-slate-200 bg-slate-50/50">
                  <div className="flex items-center justify-between mb-2">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <Map className="h-5 w-5 text-purple-600" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-2xl font-bold text-slate-900">{statesCount}</p>
                    <p className="text-sm font-medium text-slate-600">{statesCount === 1 ? 'State' : 'States'}</p>
                    <p className="text-xs font-medium text-slate-500">Geographic Reach</p>
                  </div>
                </div>

                {/* Tenure KPI */}
                <div className="rounded-xl p-4 border-2 border-slate-200 bg-slate-50/50">
                  <div className="flex items-center justify-between mb-2">
                    <div className="p-2 bg-orange-100 rounded-lg">
                      <Calendar className="h-5 w-5 text-orange-600" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-2xl font-bold text-slate-900">{tenure}</p>
                    <p className="text-sm font-medium text-slate-600">Tenure</p>
                    <p className="text-xs font-medium text-slate-500">Experience</p>
                  </div>
                </div>

                {/* Industry Focus KPI */}
                <div className="rounded-xl p-4 border-2 border-slate-200 bg-slate-50/50">
                  <div className="flex items-center justify-between mb-2">
                    <div className="p-2 bg-indigo-100 rounded-lg">
                      <Building2 className="h-5 w-5 text-indigo-600" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-2xl font-bold text-slate-900">
                      {uniqueIndustries.size}
                    </p>
                    <p className="text-sm font-medium text-slate-600">Industries</p>
                    <p className="text-xs font-medium text-slate-500">Industry Focus</p>
                  </div>
                </div>

                {/* Division Focus KPI */}
                <div className="rounded-xl p-4 border-2 border-slate-200 bg-slate-50/50">
                  <div className="flex items-center justify-between mb-2">
                    <div className="p-2 bg-cyan-100 rounded-lg">
                      <Building2 className="h-5 w-5 text-cyan-600" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-2xl font-bold text-slate-900">
                      {uniqueDivisions.size}
                    </p>
                    <p className="text-sm font-medium text-slate-600">Divisions</p>
                    <p className="text-xs font-medium text-slate-500">Division Focus</p>
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

        {/* Enhanced Assignment Section with Connected Stats */}
        <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
          <CardHeader className="pb-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-2xl font-bold text-slate-900">Account Assignment</CardTitle>
                <CardDescription className="text-slate-600 mt-2">
                  Drag accounts between columns to reassign. {profile?.role === "MASTER" ? "Changes are immediate." : "Changes create requests for approval."}
                </CardDescription>
                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <LockIcon className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-amber-800">
                      <p className="font-medium mb-1">Account Status Protection</p>
                      <p className="text-xs">
                        Accounts with "Must Keep", "For Discussion", or "To be Peeled" status are protected from being assigned to other sellers. 
                        You can still move your own accounts between statuses or unassign them. Only truly unassigned accounts appear in the "Available" pool for other sellers.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-500 flex-wrap">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span>Original</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>Must Keep</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                  <span>For Discussion</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                  <span>To be Peeled</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                  <span>Available</span>
                </div>
              </div>
            </div>
            
            {/* Account Summary Stats */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="bg-blue-50/50 rounded-lg p-3 border border-blue-200">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span className="text-sm font-medium text-blue-800">Original</span>
                </div>
                <p className="text-2xl font-bold text-blue-900 mt-1">{originalAccounts.length}</p>
              </div>
              
              <div className="bg-green-50/50 rounded-lg p-3 border border-green-200">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-sm font-medium text-green-800">Must Keep</span>
                  <LockIcon className="h-3 w-3 text-green-600" />
                </div>
                <p className="text-2xl font-bold text-green-900 mt-1">{mustKeepAccounts.length}</p>
                <p className="text-xs text-green-600 font-medium">Protected from others</p>
              </div>
              
              <div className="bg-yellow-50/50 rounded-lg p-3 border border-yellow-200">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                  <span className="text-sm font-medium text-yellow-800">For Discussion</span>
                </div>
                <p className="text-2xl font-bold text-yellow-900 mt-1">{forDiscussionAccounts.length}</p>
                <p className="text-xs text-yellow-600 font-medium">Protected from others</p>
              </div>
              
              <div className="bg-red-50/50 rounded-lg p-3 border border-red-200">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                  <span className="text-sm font-medium text-red-800">To be Peeled</span>
                </div>
                <p className="text-2xl font-bold text-red-900 mt-1">{toBePeeledAccounts.length}</p>
                <p className="text-xs text-red-600 font-medium">Protected from others</p>
              </div>
              
              <div className="bg-slate-50/50 rounded-lg p-3 border border-slate-200">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-slate-400 rounded-full"></div>
                  <span className="text-sm font-medium text-slate-800">Available</span>
                </div>
                <p className="text-2xl font-bold text-slate-900 mt-1">{availableAccounts.length}</p>
                <p className="text-xs text-slate-500 font-medium">Unassigned</p>
              </div>
            </div>
          </CardHeader>
          
          {/* Account Search */}
          <div className="px-6 pb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 h-4 w-4" />
              <Input
                type="text"
                placeholder="Search accounts by name or ID..."
                value={accountSearchQuery}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAccountSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            {accountSearchQuery && (
              <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                  <p className="text-sm text-blue-700 font-medium">
                    Showing {filteredOriginalAccounts.length + filteredMustKeepAccounts.length + filteredForDiscussionAccounts.length + filteredToBePeeledAccounts.length + filteredAvailableAccounts.length} account{(filteredOriginalAccounts.length + filteredMustKeepAccounts.length + filteredForDiscussionAccounts.length + filteredToBePeeledAccounts.length + filteredAvailableAccounts.length) !== 1 ? 's' : ''} matching "{accountSearchQuery}"
                  </p>
                </div>
              </div>
            )}
          </div>
          
          <CardContent className="pt-0">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="relative">
                  <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
                  <div className="absolute inset-0 rounded-full border-4 border-blue-200"></div>
                </div>
                <p className="mt-4 text-slate-600 font-medium">Loading account data...</p>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <div className="min-h-[700px] rounded-xl border border-slate-200 shadow-sm bg-white grid grid-cols-5">
                  <div className="hidden lg:block border-r border-slate-200">
                    <DroppableColumn
                      id="original"
                      title="Original Accounts"
                      accounts={filteredOriginalAccounts}
                      emptyMessage="No original accounts"
                      isReadOnly
                    />
                  </div>
                  
                  <div className="border-r border-slate-200">
                    <DroppableColumn
                      id="must_keep"
                      title="Must Keep"
                      accounts={filteredMustKeepAccounts}
                      emptyMessage="No accounts marked as must keep"
                      userRole={profile?.role}
                    />
                  </div>
                  
                  <div className="border-r border-slate-200">
                    <DroppableColumn
                      id="for_discussion"
                      title="For Discussion"
                      accounts={filteredForDiscussionAccounts}
                      emptyMessage="No accounts for discussion"
                      userRole={profile?.role}
                    />
                  </div>
                  
                  <div className="border-r border-slate-200">
                    <DroppableColumn
                      id="to_be_peeled"
                      title="To be Peeled"
                      accounts={filteredToBePeeledAccounts}
                      emptyMessage="No accounts to be peeled"
                    />
                  </div>
                  
                  <div className="hidden lg:block">
                    <DroppableColumn
                      id="available"
                      title="Available Accounts"
                      accounts={filteredAvailableAccounts}
                      emptyMessage="No available accounts"
                    />
                  </div>
                </div>

                <DragOverlay
                  modifiers={[restrictToWindowEdges]}
                  dropAnimation={{
                    duration: 200,
                    easing: 'ease-out',
                  }}
                >
                  {activeAccount && (
                    <div className="rotate-3 scale-105 shadow-2xl">
                      <AccountCard account={activeAccount} isDragging />
                    </div>
                  )}
                </DragOverlay>
              </DndContext>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function DroppableColumn({ 
  id, 
  title, 
  accounts, 
  emptyMessage,
  isReadOnly,
  userRole,
}: { 
  id: DroppableZone;
  title: string;
  accounts: Account[];
  emptyMessage: string;
  isReadOnly?: boolean;
  userRole?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div ref={setNodeRef} className={cn(
      "h-full flex flex-col transition-all duration-200",
      isOver && !isReadOnly && "bg-primary/5 border-primary/20 scale-[1.01]"
    )}>
      <div className={cn(
        "p-3 border-b transition-all duration-200",
        id === "original" && "bg-blue-50/50 border-blue-200",
        id === "must_keep" && "bg-green-50/50 border-green-200",
        id === "for_discussion" && "bg-yellow-50/50 border-yellow-200",
        id === "to_be_peeled" && "bg-red-50/50 border-red-200",
        id === "available" && "bg-slate-50/50 border-slate-200",
        isOver && !isReadOnly && "bg-primary/10 border-primary/30 shadow-lg"
      )}>
        <div className="flex items-center gap-2">
          <div className={cn(
            "w-2.5 h-2.5 rounded-full",
            id === "original" && "bg-blue-500",
            id === "must_keep" && "bg-green-500",
            id === "for_discussion" && "bg-yellow-500",
            id === "to_be_peeled" && "bg-red-500",
            id === "available" && "bg-slate-400"
          )}></div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm text-slate-900 truncate">{title}</h3>
            <p className="text-xs text-slate-600">{accounts.length} accounts</p>
            {isOver && !isReadOnly && (
              <p className="text-xs text-primary font-medium animate-pulse mt-1">
                Drop here to assign
              </p>
            )}
          </div>
        </div>
      </div>
      
      <ScrollArea className="flex-1">
        <div className={cn(
          "p-3 space-y-3 min-h-full transition-all duration-200",
          isOver && !isReadOnly && "bg-accent/10"
        )}>
          {accounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
              <Building2 className="h-12 w-12 mb-3 opacity-40" />
              <p className="text-xs font-medium text-center">{emptyMessage}</p>
            </div>
          ) : (
            accounts.map(account => (
              isReadOnly ? (
                <AccountCard key={`${id}-${account.id}-${account.status || 'original'}`} account={account} isReadOnly />
              ) : (
                <DraggableAccount 
                  key={`${id}-${account.id}-${account.status || 'available'}`} 
                  account={account} 
                  userRole={userRole}
                />
              )
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function DraggableAccount({ 
  account, 
  userRole,
}: { 
  account: Account;
  userRole?: string;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: account.id,
    disabled: false, // All cards are draggable except original accounts
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    zIndex: 1000,
  } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
    >
      <AccountCard 
        account={account} 
        isDragging={isDragging}
      />
    </div>
  );
}

function AccountCard({ 
  account, 
  isDragging,
  isReadOnly,
}: { 
  account: Account; 
  isDragging?: boolean;
  isReadOnly?: boolean;
}) {
  const isMustKeep = account.status === 'must_keep' || account.status === 'pinned' || account.status === 'approval_for_pinning';
  
  return (
    <Card className={cn(
      "transition-all duration-200 relative border group w-full",
      !isReadOnly && "cursor-grab active:cursor-grabbing hover:shadow-md hover:border-primary/50 hover:-translate-y-0.5",
      isReadOnly && "bg-slate-50/50 border-slate-200",
      isDragging && "opacity-40 shadow-2xl scale-110 rotate-2 border-primary/50"
    )}>
      <CardContent className="p-3">
        {/* Header with Account Name and Status */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-sm text-slate-900 truncate mb-1">{account.name}</h4>
            
          </div>
          
          {/* Division Badge */}
          <Badge variant="outline" className="text-xs font-bold bg-white border-slate-300 text-slate-700 px-1.5 py-0.5 shadow-sm">
            {account.current_division}
          </Badge>
        </div>
        
        {/* Revenue Display */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-2 border border-blue-200 mb-2">
          <div className="flex items-center justify-between">
            <div className="text-xs text-blue-600 font-medium">Weighted Revenue</div>
            <div className="text-sm font-bold text-blue-900">
              {(() => {
                const weightedRevenue = account.revenue_breakdown.esg + account.revenue_breakdown.gdt + account.revenue_breakdown.gvc + account.revenue_breakdown.msg_us;
                return weightedRevenue >= 1_000_000 
                  ? `$${(weightedRevenue / 1_000_000).toFixed(1)}M`
                  : weightedRevenue >= 1_000 
                  ? `$${(weightedRevenue / 1_000).toFixed(0)}K`
                  : `$${weightedRevenue.toFixed(0)}`;
              })()}
            </div>
          </div>
        </div>
        
        {/* Location and Industry */}
        <div className="flex flex-wrap gap-1">
          {account.city && account.state && (
            <Badge variant="secondary" className="text-xs font-medium bg-slate-100 text-slate-700 px-1.5 py-0.5">
              {account.state}
            </Badge>
          )}
          {account.industry && (
            <Badge variant="outline" className="text-xs font-medium border-slate-300 text-slate-600 px-1.5 py-0.5 truncate max-w-[100px]">
              {account.industry}
            </Badge>
          )}
          {!isReadOnly && !account.status && account.fitPercentage !== undefined && (
            <Badge 
              variant="outline" 
              className={cn(
                "text-xs font-bold px-1.5 py-0.5",
                account.fitPercentage >= 80 && "bg-green-50 text-green-700 border-green-300",
                account.fitPercentage >= 60 && account.fitPercentage < 80 && "bg-yellow-50 text-yellow-700 border-yellow-300",
                account.fitPercentage < 60 && "bg-red-50 text-red-700 border-red-300"
              )}
            >
              {account.fitPercentage}% fit
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
