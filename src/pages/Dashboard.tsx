import { useAuth } from "@/contexts/AuthContext";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Upload, Users, DollarSign, Briefcase, TrendingUp } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DivisionBadge } from "@/components/dashboard/DivisionBadge";
import { Link } from "react-router-dom";
import { useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  importAccounts,
  importSellers,
  importRelationshipMap,
  importManagerTeam,
} from "@/lib/importers";

export default function Dashboard() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [importing, setImporting] = useState<null | string>(null);

  // File input refs
  const accountsInputRef = useRef<HTMLInputElement>(null);
  const sellersInputRef = useRef<HTMLInputElement>(null);
  const relMapInputRef = useRef<HTMLInputElement>(null);
  const mgrTeamInputRef = useRef<HTMLInputElement>(null);

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

  // Fetch relationship maps for revenue calculations
  const { data: relationships = [] } = useQuery({
    queryKey: ["relationship_maps"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("relationship_maps")
        .select(`
          *,
          account:accounts!inner(*, revenue:account_revenues!inner(*))
        `);
      
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

  // Calculate KPIs by size using unique account revenues
  const calculateKPIs = (size: "enterprise" | "midmarket") => {
    const sizeAccountsWithRevenue = accountsWithRevenue.filter(a => a.size === size);
    const sizeSellers = sellers.filter(s => s.size === size);
    
    // Calculate total revenue for unique accounts of this size
    const totalRevenue = sizeAccountsWithRevenue.reduce((sum, account) => {
      const revenueRow = Array.isArray(account.revenue)
        ? account.revenue[0]
        : account.revenue;
      if (!revenueRow) return sum;
      
      const accountRevenue = (
        Number(revenueRow.revenue_esg || 0) +
        Number(revenueRow.revenue_gdt || 0) +
        Number(revenueRow.revenue_gvc || 0) +
        Number(revenueRow.revenue_msg_us || 0)
      );
      
      return sum + accountRevenue;
    }, 0);

    const avgRevenue = sizeAccountsWithRevenue.length > 0 
      ? totalRevenue / sizeAccountsWithRevenue.length 
      : 0;

    return {
      accountCount: sizeAccountsWithRevenue.length,
      sellerCount: sizeSellers.length,
      totalRevenue,
      avgRevenue,
    };
  };

  const enterpriseKPIs = calculateKPIs("enterprise");
  const midmarketKPIs = calculateKPIs("midmarket");

  // Import handler
  async function handleImport(
    kind: "accounts" | "sellers" | "relmap" | "mgrteam",
    file?: File | null
  ) {
    if (!file) return;
    try {
      setImporting(kind);
      if (kind === "accounts") await importAccounts(file);
      if (kind === "sellers") await importSellers(file);
      if (kind === "relmap") await importRelationshipMap(file);
      if (kind === "mgrteam") await importManagerTeam(file);

      toast({
        title: "Import complete",
        description: `Successfully imported ${kind}.`,
      });

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["sellers"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["relationship_maps"] });
      queryClient.invalidateQueries({ queryKey: ["accounts-with-revenue"] });
      queryClient.invalidateQueries({ queryKey: ["sellerRevenue"] });
    } catch (e: any) {
      toast({
        title: "Import failed",
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    } finally {
      setImporting(null);
    }
  }

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
    revenueData.map(r => [r.seller_id, Number(r.seller_total_revenue) || 0])
  );

  // Calculate seller account counts
  const sellerRevenues = sellers.map(seller => {
    const sellerRelationships = relationships.filter(
      r => r.seller_id === seller.id && 
           (r.status === 'must_keep' || r.status === 'for_discussion')
    );

    return {
      ...seller,
      accountCount: sellerRelationships.length,
      totalRevenue: revenueMap.get(seller.id) || 0,
    };
  });

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      
      <main className="container mx-auto p-6 space-y-6">
        {/* Upload Section - MASTER only */}
        {profile?.role === "MASTER" && (
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Data Import
              </CardTitle>
              <CardDescription>
                Upload Excel files to import accounts, sellers, and relationship maps
              </CardDescription>
            </CardHeader>
            <CardContent className="flex gap-4 items-center">
              <input
                ref={accountsInputRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => handleImport("accounts", e.target.files?.[0] ?? null)}
              />
              <input
                ref={sellersInputRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => handleImport("sellers", e.target.files?.[0] ?? null)}
              />
              <input
                ref={relMapInputRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => handleImport("relmap", e.target.files?.[0] ?? null)}
              />
              <input
                ref={mgrTeamInputRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => handleImport("mgrteam", e.target.files?.[0] ?? null)}
              />

              <Button
                variant="outline"
                className="flex-1"
                onClick={() => accountsInputRef.current?.click()}
                disabled={importing !== null}
              >
                <Upload className="mr-2 h-4 w-4" />
                {importing === "accounts" ? "Importing..." : "Accounts.xlsx"}
              </Button>

              <Button
                variant="outline"
                className="flex-1"
                onClick={() => sellersInputRef.current?.click()}
                disabled={importing !== null}
              >
                <Upload className="mr-2 h-4 w-4" />
                {importing === "sellers" ? "Importing..." : "Sellers.xlsx"}
              </Button>

              <Button
                variant="outline"
                className="flex-1"
                onClick={() => relMapInputRef.current?.click()}
                disabled={importing !== null}
              >
                <Upload className="mr-2 h-4 w-4" />
                {importing === "relmap" ? "Importing..." : "Relationship Map"}
              </Button>

              <Button
                variant="outline"
                className="flex-1"
                onClick={() => mgrTeamInputRef.current?.click()}
                disabled={importing !== null}
              >
                <Upload className="mr-2 h-4 w-4" />
                {importing === "mgrteam" ? "Importing..." : "Manager Team"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* KPI Tabs */}
        <Tabs defaultValue="enterprise" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="enterprise">Enterprise</TabsTrigger>
            <TabsTrigger value="midmarket">Midmarket</TabsTrigger>
          </TabsList>

          <TabsContent value="enterprise" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              <Card className="shadow-card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Accounts</CardTitle>
                  <Briefcase className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{enterpriseKPIs.accountCount}</div>
                </CardContent>
              </Card>
              
              <Card className="shadow-card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    ${enterpriseKPIs.totalRevenue.toLocaleString()}
                  </div>
                </CardContent>
              </Card>
              
              <Card className="shadow-card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Avg Revenue/Account</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    ${enterpriseKPIs.avgRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </div>
                </CardContent>
              </Card>
              
              <Card className="shadow-card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Sellers</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{enterpriseKPIs.sellerCount}</div>
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
                  {sellerRevenues
                    .filter(s => s.size === 'enterprise')
                    .map(seller => (
                      <Link key={seller.id} to={`/sellers/${seller.id}`}>
                        <Card className="cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02]">
                          <CardHeader>
                            <div className="flex items-start justify-between">
                              <CardTitle className="text-base">{seller.name}</CardTitle>
                              <DivisionBadge division={seller.division} />
                            </div>
                            <CardDescription className="text-xs">
                              {seller.manager?.name || "No Manager"}
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-1">
                            <p className="text-sm text-muted-foreground">
                              {seller.accountCount} accounts
                            </p>
                            <p className="text-lg font-semibold text-primary">
                              ${seller.totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </p>
                          </CardContent>
                        </Card>
                      </Link>
                    ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="midmarket" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              <Card className="shadow-card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Accounts</CardTitle>
                  <Briefcase className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{midmarketKPIs.accountCount}</div>
                </CardContent>
              </Card>
              
              <Card className="shadow-card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    ${midmarketKPIs.totalRevenue.toLocaleString()}
                  </div>
                </CardContent>
              </Card>
              
              <Card className="shadow-card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Avg Revenue/Account</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    ${midmarketKPIs.avgRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </div>
                </CardContent>
              </Card>
              
              <Card className="shadow-card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Sellers</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{midmarketKPIs.sellerCount}</div>
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
                  {sellerRevenues
                    .filter(s => s.size === 'midmarket')
                    .map(seller => (
                      <Link key={seller.id} to={`/sellers/${seller.id}`}>
                        <Card className="cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02]">
                          <CardHeader>
                            <div className="flex items-start justify-between">
                              <CardTitle className="text-base">{seller.name}</CardTitle>
                              <DivisionBadge division={seller.division} />
                            </div>
                            <CardDescription className="text-xs">
                              {seller.manager?.name || "No Manager"}
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-1">
                            <p className="text-sm text-muted-foreground">
                              {seller.accountCount} accounts
                            </p>
                            <p className="text-lg font-semibold text-primary">
                              ${seller.totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </p>
                          </CardContent>
                        </Card>
                      </Link>
                    ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
