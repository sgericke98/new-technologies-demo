'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowLeft, 
  Home, 
  Shield, 
  Activity, 
  Database,
  RefreshCw,
  Download,
  Filter,
  Search
} from 'lucide-react';
import Link from 'next/link';
import { AuditLogTable } from '@/components/audit/AuditLogTable';
import { AuditStats } from '@/components/audit/AuditStats';
import { 
  getAuditLogs, 
  getAuditStats, 
  AuditLog,
  AUDIT_ACTIONS,
  AUDIT_ENTITIES 
} from '@/lib/audit';

interface AuditFilters {
  entity?: string;
  action?: string;
  user_id?: string;
  search?: string;
}

export default function AuditPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [filters, setFilters] = useState<AuditFilters>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [refreshing, setRefreshing] = useState(false);

  const isAdmin = user?.user_metadata?.role === 'MASTER' || user?.user_metadata?.role === 'MANAGER';
  const ITEMS_PER_PAGE = 20;

  useEffect(() => {
    if (isAdmin) {
      fetchAuditData();
      fetchStats();
    }
  }, [isAdmin, filters, currentPage]);

  const fetchAuditData = async () => {
    try {
      setLoading(true);
      const offset = (currentPage - 1) * ITEMS_PER_PAGE;
      
      const auditLogs = await getAuditLogs({
        ...filters,
        limit: ITEMS_PER_PAGE,
        offset,
        order_by: 'created_at',
        order_direction: 'desc',
      });

      setLogs(auditLogs);
      
      // Calculate total pages (this is a simplified approach)
      // In a real app, you'd want to get the total count from the API
      setTotalPages(Math.max(1, Math.ceil(auditLogs.length / ITEMS_PER_PAGE)));
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      toast({
        title: 'Error',
        description: 'Failed to load audit logs',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      setStatsLoading(true);
      const auditStats = await getAuditStats();
      setStats(auditStats);
    } catch (error) {
      console.error('Error fetching audit stats:', error);
      toast({
        title: 'Error',
        description: 'Failed to load audit statistics',
        variant: 'destructive',
      });
    } finally {
      setStatsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchAuditData(), fetchStats()]);
      toast({
        title: 'Refreshed',
        description: 'Audit data has been updated',
      });
    } catch (error) {
      console.error('Error refreshing audit data:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleFilter = (newFilters: AuditFilters) => {
    setFilters(newFilters);
    setCurrentPage(1); // Reset to first page when filtering
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleExport = async () => {
    try {
      // In a real implementation, you'd call an API endpoint to export data
      toast({
        title: 'Export Started',
        description: 'Audit data export is being prepared...',
      });
    } catch (error) {
      console.error('Error exporting audit data:', error);
      toast({
        title: 'Export Failed',
        description: 'Failed to export audit data',
        variant: 'destructive',
      });
    }
  };

  if (!isAdmin) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-red-500" />
                Access Denied
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-600">
                You do not have permission to access audit logs. 
                Only administrators can view the audit trail.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-4 mb-6">
              <Link 
                href="/dashboard"
                className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="text-sm font-medium">Back to Dashboard</span>
              </Link>
              <div className="h-6 w-px bg-slate-300" />
              <Link 
                href="/dashboard"
                className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
              >
                <Home className="h-4 w-4" />
                <span className="text-sm font-medium">Dashboard</span>
              </Link>
            </div>
            
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-purple-100 rounded-xl">
                    <Shield className="h-6 w-6 text-purple-600" />
                  </div>
                  <div>
                    <h1 className="text-3xl font-bold text-slate-900">Audit Trail</h1>
                    <p className="text-slate-600 mt-1">
                      Track all changes and activities across the system
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    onClick={handleExport}
                    className="flex items-center gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Export
                  </Button>
                  <Button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="flex items-center gap-2"
                  >
                    <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="overview" className="flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="logs" className="flex items-center gap-2">
                <Database className="h-4 w-4" />
                Audit Logs
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              <AuditStats stats={stats} loading={statsLoading} />
              
              {/* Quick Actions */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Filter className="h-5 w-5" />
                    Quick Filters
                  </CardTitle>
                  <CardDescription>
                    Quickly filter audit logs by common criteria
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Button
                      variant="outline"
                      onClick={() => handleFilter({ action: AUDIT_ACTIONS.CREATE })}
                      className="flex items-center gap-2"
                    >
                      <Badge variant="default">Create</Badge>
                      <span>New Records</span>
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleFilter({ action: AUDIT_ACTIONS.UPDATE })}
                      className="flex items-center gap-2"
                    >
                      <Badge variant="secondary">Update</Badge>
                      <span>Modifications</span>
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleFilter({ entity: AUDIT_ENTITIES.SELLER })}
                      className="flex items-center gap-2"
                    >
                      <span>👤</span>
                      <span>Seller Changes</span>
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleFilter({ entity: AUDIT_ENTITIES.ACCOUNT })}
                      className="flex items-center gap-2"
                    >
                      <span>🏢</span>
                      <span>Account Changes</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="logs" className="space-y-6">
              <AuditLogTable
                logs={logs}
                loading={loading}
                onRefresh={handleRefresh}
                onFilter={handleFilter}
                pagination={{
                  page: currentPage,
                  totalPages,
                  onPageChange: handlePageChange,
                }}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
