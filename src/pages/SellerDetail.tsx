import { useParams, useNavigate, Link } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Building2, LockIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { DndContext, DragEndEvent, DragOverlay, useSensor, useSensors, PointerSensor, useDraggable, useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { SellerStatsCard } from "@/components/seller/SellerStatsCard";
import { RevenueDisplay } from "@/components/seller/RevenueDisplay";
import { PinButton } from "@/components/seller/PinButton";
import { useQuery, useQueryClient } from "@tanstack/react-query";

type Account = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  industry: string | null;
  current_division: string;
  total_revenue: number;
  revenue_breakdown: {
    esg: number;
    gdt: number;
    gvc: number;
    msg_us: number;
  };
  status?: 'assigned' | 'pinned';
  isOriginal: boolean;
};

type Seller = {
  id: string;
  name: string;
  division: string;
  city: string | null;
  state: string | null;
  tenure_months: number;
};

type DroppableZone = "original" | "assigned" | "available";

export default function SellerDetail() {
  const { id } = useParams();
  const { profile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [authorized, setAuthorized] = useState(false);
  const [checking, setChecking] = useState(true);
  const [seller, setSeller] = useState<Seller | null>(null);
  const [originalAccounts, setOriginalAccounts] = useState<Account[]>([]);
  const [assignedAccounts, setAssignedAccounts] = useState<Account[]>([]);
  const [availableAccounts, setAvailableAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);

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
        distance: 8,
      },
    })
  );

  useEffect(() => {
    (async () => {
      if (!profile || !id) {
        navigate("/dashboard");
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
          navigate("/dashboard");
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
          navigate("/dashboard");
          return;
        }
      }

      setChecking(false);
    })();
  }, [id, profile, navigate, toast]);

  useEffect(() => {
    if (!authorized) return;
    
    const fetchData = async () => {
      setLoading(true);
      
      const { data: sellerData } = await supabase
        .from("sellers")
        .select("id, name, division, city, state, tenure_months")
        .eq("id", id)
        .single();
      
      if (sellerData) {
        setSeller(sellerData);
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
            current_division
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
            current_division
          )
        `)
        .eq("seller_id", id)
        .in("status", ["assigned", "pinned"]);

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

          // Apply weighted calculation using percentages
          const breakdown = {
            esg: Number(revenue.revenue_esg || 0) * Number(r.pct_esg || 0) / 100,
            gdt: Number(revenue.revenue_gdt || 0) * Number(r.pct_gdt || 0) / 100,
            gvc: Number(revenue.revenue_gvc || 0) * Number(r.pct_gvc || 0) / 100,
            msg_us: Number(revenue.revenue_msg_us || 0) * Number(r.pct_msg_us || 0) / 100,
          };

          const total_revenue = breakdown.esg + breakdown.gdt + breakdown.gvc + breakdown.msg_us;
          
          return {
            ...account,
            total_revenue,
            revenue_breakdown: breakdown,
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

          // Apply weighted calculation using percentages
          const breakdown = {
            esg: Number(revenue.revenue_esg || 0) * Number(r.pct_esg || 0) / 100,
            gdt: Number(revenue.revenue_gdt || 0) * Number(r.pct_gdt || 0) / 100,
            gvc: Number(revenue.revenue_gvc || 0) * Number(r.pct_gvc || 0) / 100,
            msg_us: Number(revenue.revenue_msg_us || 0) * Number(r.pct_msg_us || 0) / 100,
          };

          const total_revenue = breakdown.esg + breakdown.gdt + breakdown.gvc + breakdown.msg_us;
          
          return {
            ...account,
            total_revenue,
            revenue_breakdown: breakdown,
            status: r.status,
            isOriginal: false,
          };
        })
        .filter(Boolean) || [];

      const sortedAssigned = assignedAccountsWithRevenue.sort((a: Account, b: Account) => {
        if ((a.status === 'pinned' || a.status === 'must_keep') && (b.status !== 'pinned' && b.status !== 'must_keep')) return -1;
        if ((a.status !== 'pinned' && a.status !== 'must_keep') && (b.status === 'pinned' || b.status === 'must_keep')) return 1;
        return 0;
      });
      
      setOriginalAccounts(originalAccountsWithRevenue);
      setAssignedAccounts(sortedAssigned);

      const assignedIds = [...originalAccountsWithRevenue, ...assignedAccountsWithRevenue].map((a: Account) => a.id);
      const { data: allAccounts } = await supabase
        .from("accounts")
        .select(`
          id, 
          name, 
          city, 
          state, 
          industry, 
          current_division
        `);

      const available = (allAccounts || [])
        .filter(a => !assignedIds.includes(a.id))
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
      
      setAvailableAccounts(available);
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
    const account = [...assignedAccounts, ...availableAccounts].find(a => a.id === accountId);

    if (!account || targetZone === "original") return;

    const isCurrentlyAssigned = assignedAccounts.some(a => a.id === accountId);

    if ((targetZone === "assigned" && isCurrentlyAssigned) || 
        (targetZone === "available" && !isCurrentlyAssigned)) {
      return;
    }

    const isAssigning = targetZone === "assigned";

    if (profile?.role === "MASTER") {
      if (isAssigning) {
        // Set default percentages based on account's current division
        const divisionMap: Record<string, { pct_esg: number; pct_gdt: number; pct_gvc: number; pct_msg_us: number }> = {
          "ESG": { pct_esg: 100, pct_gdt: 0, pct_gvc: 0, pct_msg_us: 0 },
          "GDT": { pct_esg: 0, pct_gdt: 100, pct_gvc: 0, pct_msg_us: 0 },
          "GVC": { pct_esg: 0, pct_gdt: 0, pct_gvc: 100, pct_msg_us: 0 },
          "MSG_US": { pct_esg: 0, pct_gdt: 0, pct_gvc: 0, pct_msg_us: 100 },
        };
        
        const percentages = divisionMap[account.current_division] || { pct_esg: 0, pct_gdt: 0, pct_gvc: 0, pct_msg_us: 0 };

        const { error } = await supabase
          .from("relationship_maps")
          .insert({
            account_id: accountId,
            seller_id: id,
            status: "assigned",
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

        setAssignedAccounts([...assignedAccounts, { ...account, status: 'assigned' }]);
        setAvailableAccounts(availableAccounts.filter(a => a.id !== accountId));
        
        queryClient.invalidateQueries({ queryKey: ["sellerRevenue"] });
        
        toast({
          title: "Account assigned",
          description: `${account.name} has been assigned to ${seller.name}`,
        });
      } else {
        const { error } = await supabase
          .from("relationship_maps")
          .delete()
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

        setAvailableAccounts([...availableAccounts, account]);
        setAssignedAccounts(assignedAccounts.filter(a => a.id !== accountId));

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

  const handlePinToggle = async (accountId: string, currentStatus?: string) => {
    if (!seller || !profile) return;

    if (profile.role === "MASTER") {
      const newStatus = currentStatus === 'pinned' ? 'assigned' : 'pinned';
      const { error } = await supabase
        .from("relationship_maps")
        .update({ status: newStatus, last_actor_user_id: profile.id })
        .eq("account_id", accountId)
        .eq("seller_id", id);

      if (error) {
        toast({
          title: "Error",
          description: "Failed to update pin status",
          variant: "destructive",
        });
        return;
      }

      setAssignedAccounts(prev => 
        prev.map(a => a.id === accountId ? { ...a, status: newStatus as 'assigned' | 'pinned' } : a)
          .sort((a, b) => {
            if ((a.status === 'pinned' || a.status === 'must_keep') && (b.status !== 'pinned' && b.status !== 'must_keep')) return -1;
            if ((a.status !== 'pinned' && a.status !== 'must_keep') && (b.status === 'pinned' || b.status === 'must_keep')) return 1;
            return 0;
          })
      );

      queryClient.invalidateQueries({ queryKey: ["sellerRevenue"] });

      toast({
        title: newStatus === 'pinned' ? "Account pinned" : "Account unpinned",
        description: `${assignedAccounts.find(a => a.id === accountId)?.name} has been ${newStatus === 'pinned' ? 'pinned' : 'unpinned'}`,
      });
    } else if (profile.role === "MANAGER") {
      const { error } = await supabase
        .from("requests")
        .insert({
          type: "pin",
          account_id: accountId,
          target_seller_id: id,
          requester_user_id: profile.id,
          status: "pending",
          reason: `Request to ${currentStatus === 'pinned' ? 'unpin' : 'pin'} account`,
        });

      if (error) {
        toast({
          title: "Error",
          description: "Failed to create pin request",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Request created",
        description: "Your pin request has been submitted for approval",
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
    ? [...assignedAccounts, ...availableAccounts].find(a => a.id === activeId)
    : null;

  const totalRevenue = revenueData ?? 0;
  const totalAccounts = originalAccounts.length + assignedAccounts.length;
  const location = seller?.city && seller?.state ? `${seller.city}, ${seller.state}` : "N/A";
  const tenure = seller?.tenure_months 
    ? `${Math.floor(seller.tenure_months / 12)}y ${seller.tenure_months % 12}m`
    : "N/A";
  
  const uniqueStates = new Set(
    [...originalAccounts, ...assignedAccounts]
      .map(a => a.state)
      .filter(state => state !== null && state !== undefined && state !== '')
  );
  const statesCount = uniqueStates.size;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      
      <main className="container mx-auto p-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link to="/dashboard">
              <Button variant="outline" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold">{seller?.name || "Loading..."}</h1>
              {seller && (
                <p className="text-muted-foreground">
                  Division: <Badge variant="outline">{seller.division}</Badge>
                </p>
              )}
            </div>
          </div>
          
          {seller && (
            <SellerStatsCard
              accountCount={totalAccounts}
              totalRevenue={totalRevenue}
              location={location}
              tenure={tenure}
              division={seller.division}
              statesCount={statesCount}
            />
          )}
        </div>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Account Assignment</CardTitle>
            <CardDescription>
              Drag accounts between columns to reassign. {profile?.role === "MASTER" ? "Changes are immediate." : "Changes create requests for approval."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <ResizablePanelGroup direction="horizontal" className="min-h-[600px] rounded-lg border">
                  <ResizablePanel defaultSize={25} minSize={20}>
                    <DroppableColumn
                      id="original"
                      title="Original Accounts"
                      accounts={originalAccounts}
                      emptyMessage="No original accounts"
                      isReadOnly
                    />
                  </ResizablePanel>
                  
                  <ResizableHandle withHandle />
                  
                  <ResizablePanel defaultSize={50} minSize={30}>
                    <DroppableColumn
                      id="assigned"
                      title="Currently Assigned"
                      accounts={assignedAccounts}
                      emptyMessage="No accounts assigned yet"
                      onPinToggle={handlePinToggle}
                      userRole={profile?.role}
                    />
                  </ResizablePanel>
                  
                  <ResizableHandle withHandle />
                  
                  <ResizablePanel defaultSize={25} minSize={20}>
                    <DroppableColumn
                      id="available"
                      title="Available Accounts"
                      accounts={availableAccounts}
                      emptyMessage="No available accounts"
                    />
                  </ResizablePanel>
                </ResizablePanelGroup>

                <DragOverlay>
                  {activeAccount && <AccountCard account={activeAccount} isDragging />}
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
  onPinToggle,
  userRole,
}: { 
  id: DroppableZone;
  title: string;
  accounts: Account[];
  emptyMessage: string;
  isReadOnly?: boolean;
  onPinToggle?: (accountId: string, currentStatus?: string) => void;
  userRole?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div ref={setNodeRef} className="h-full flex flex-col">
      <div className="p-4 border-b bg-muted/50">
        <h3 className="font-semibold text-lg">{title}</h3>
        <p className="text-sm text-muted-foreground">{accounts.length} accounts</p>
      </div>
      
      <ScrollArea className="flex-1">
        <div className={cn(
          "p-4 space-y-2 min-h-full transition-colors",
          isOver && !isReadOnly && "bg-accent/20"
        )}>
          {accounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Building2 className="h-12 w-12 mb-2 opacity-50" />
              <p>{emptyMessage}</p>
            </div>
          ) : (
            accounts.map(account => (
              isReadOnly ? (
                <AccountCard key={account.id} account={account} isReadOnly />
              ) : (
                <DraggableAccount 
                  key={account.id} 
                  account={account} 
                  onPinToggle={onPinToggle}
                  userRole={userRole}
                  showPin={id === "assigned"}
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
  onPinToggle,
  userRole,
  showPin,
}: { 
  account: Account;
  onPinToggle?: (accountId: string, currentStatus?: string) => void;
  userRole?: string;
  showPin?: boolean;
}) {
  const isPinnedAndManager = (account.status === 'pinned' || account.status === 'must_keep') && userRole === 'MANAGER';
  
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: account.id,
    disabled: isPinnedAndManager,
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(isPinnedAndManager ? {} : listeners)}
      {...(isPinnedAndManager ? {} : attributes)}
    >
      <AccountCard 
        account={account} 
        isDragging={isDragging}
        onPinToggle={onPinToggle}
        showPin={showPin}
        isLocked={isPinnedAndManager}
      />
    </div>
  );
}

function AccountCard({ 
  account, 
  isDragging,
  isReadOnly,
  onPinToggle,
  showPin,
  isLocked,
}: { 
  account: Account; 
  isDragging?: boolean;
  isReadOnly?: boolean;
  onPinToggle?: (accountId: string, currentStatus?: string) => void;
  showPin?: boolean;
  isLocked?: boolean;
}) {
  const isPinned = account.status === 'pinned' || account.status === 'must_keep';
  
  return (
    <Card className={cn(
      "transition-all hover:shadow-md relative",
      !isReadOnly && !isLocked && "cursor-grab active:cursor-grabbing",
      isReadOnly && "bg-muted/30",
      isPinned && "border-l-4 border-l-primary",
      isDragging && "opacity-50 shadow-lg",
      isLocked && "cursor-not-allowed"
    )}>
      <CardContent className="p-4">
        {isReadOnly && (
          <div className="absolute top-2 right-2 flex items-center gap-1">
            <Badge variant="secondary" className="text-xs">Original</Badge>
            <LockIcon className="h-3 w-3 text-muted-foreground" />
          </div>
        )}
        
        {isLocked && (
          <div className="absolute inset-0 bg-background/50 rounded-lg flex items-center justify-center">
            <LockIcon className="h-8 w-8 text-muted-foreground" />
          </div>
        )}
        
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-semibold truncate">{account.name}</h4>
              {showPin && onPinToggle && (
                <PinButton
                  isPinned={isPinned}
                  isLocked={isLocked || false}
                  onClick={() => onPinToggle(account.id, account.status)}
                />
              )}
            </div>
            
            <RevenueDisplay
              totalRevenue={account.total_revenue}
              breakdown={account.revenue_breakdown}
            />
            
            <div className="flex flex-wrap gap-1 mt-2">
              {account.city && account.state && (
                <Badge variant="secondary" className="text-xs">
                  {account.city}, {account.state}
                </Badge>
              )}
              {account.industry && (
                <Badge variant="outline" className="text-xs">
                  {account.industry}
                </Badge>
              )}
            </div>
          </div>
          <Badge variant="outline">{account.current_division}</Badge>
        </div>
      </CardContent>
    </Card>
  );
}
