'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
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
import { PageLoader } from '@/components/ui/loader';
import { LoadingTimeout } from '@/components/ui/loading-timeout';
import { 
  getAuditLogs, 
  getAuditStats, 
  AuditLog,
  AUDIT_ACTIONS,
  AUDIT_ENTITIES 
} from '@/lib/audit';
import { getAuditStatsOptimized } from '@/lib/optimized-queries';

interface AuditFilters {
  entity?: string;
  action?: string;
  user_id?: string;
  search?: string;
}

export default function AuditPage() {
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [filters, setFilters] = useState<AuditFilters>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [refreshing, setRefreshing] = useState(false);

  const isAdmin = user?.user_metadata?.role === 'MASTER' || user?.user_metadata?.role === 'MANAGER';
  const ITEMS_PER_PAGE = 20;

  // Redirect if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      router.push("/auth");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (isAdmin) {
      // Add debouncing to prevent excessive API calls
      const timeoutId = setTimeout(() => {
        fetchAuditData();
        fetchStats();
      }, 300); // 300ms debounce

      return () => clearTimeout(timeoutId);
    }
  }, [isAdmin, filters, currentPage]);

  const fetchAuditData = async () => {
    try {
      setDataLoading(true);
      const offset = (currentPage - 1) * ITEMS_PER_PAGE;
      
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout')), 10000)
      );
      
      const auditLogsPromise = getAuditLogs({
        ...filters,
        limit: ITEMS_PER_PAGE,
        offset,
        order_by: 'created_at',
        order_direction: 'desc',
      });

      const auditLogs = await Promise.race([auditLogsPromise, timeoutPromise]) as any[];

      setLogs(auditLogs);
      
      // Calculate total pages (this is a simplified approach)
      // In a real app, you'd want to get the total count from the API
      setTotalPages(Math.max(1, Math.ceil(auditLogs.length / ITEMS_PER_PAGE)));
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      toast({
        title: 'Error',
        description: error instanceof Error && error.message === 'Request timeout' 
          ? 'Request timed out. Please try again.' 
          : 'Failed to load audit logs',
        variant: 'destructive',
      });
    } finally {
      setDataLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      setStatsLoading(true);
      
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout')), 10000)
      );
      
      const statsPromise = getAuditStatsOptimized();
      const auditStats = await Promise.race([statsPromise, timeoutPromise]) as any;
      
      setStats(auditStats);
    } catch (error) {
      console.error('Error fetching audit stats:', error);
      toast({
        title: 'Error',
        description: error instanceof Error && error.message === 'Request timeout' 
          ? 'Request timed out. Please try again.' 
          : 'Failed to load audit statistics',
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
      setDataLoading(true);
      toast({
        title: 'Export Started',
        description: 'Preparing audit data for download...',
      });

      // Fetch all audit logs for export (without pagination)
      const allLogs = await getAuditLogs({
        ...filters,
        limit: 10000, // Large limit to get all data
        order_by: 'created_at',
        order_direction: 'desc',
      });

      // Convert to Excel format
      const excelContent = convertToExcel(allLogs);
      
      // Create and download the file
      const blob = new Blob([excelContent], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `audit-logs-${new Date().toISOString().split('T')[0]}.xlsx`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      const filterInfo = Object.entries(filters)
        .filter(([_, value]) => value)
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ');

      toast({
        title: 'Export Complete',
        description: `Downloaded ${allLogs.length} audit records${filterInfo ? ` (filtered by: ${filterInfo})` : ''}`,
      });
    } catch (error) {
      console.error('Error exporting audit data:', error);
      toast({
        title: 'Export Failed',
        description: 'Failed to export audit data',
        variant: 'destructive',
      });
    } finally {
      setDataLoading(false);
    }
  };

  // Helper function to convert audit logs to Excel format
  const convertToExcel = (logs: AuditLog[]) => {
    // Create Excel-compatible HTML with proper formatting
    const headers = [
      'ID',
      'User',
      'User Email', 
      'User Role',
      'Action',
      'Entity',
      'Entity ID',
      'Before',
      'After',
      'Created At'
    ];

    const rows = logs.map(log => [
      log.id,
      log.profiles?.name || 'Unknown',
      log.profiles?.email || 'Unknown',
      log.profiles?.role || 'Unknown',
      log.action,
      log.entity,
      log.entity_id || '',
      log.before ? JSON.stringify(log.before, null, 2) : '',
      log.after ? JSON.stringify(log.after, null, 2) : '',
      new Date(log.created_at).toLocaleString()
    ]);

    // Create Excel-compatible HTML
    const excelHtml = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" 
            xmlns:x="urn:schemas-microsoft-com:office:excel" 
            xmlns="http://www.w3.org/TR/REC-html40">
        <head>
          <meta charset="utf-8">
          <meta name="ProgId" content="Excel.Sheet">
          <meta name="Generator" content="Microsoft Excel 11">
          <!--[if gte mso 9]>
          <xml>
            <x:ExcelWorkbook>
              <x:ExcelWorksheets>
                <x:ExcelWorksheet>
                  <x:Name>Audit Logs</x:Name>
                  <x:WorksheetOptions>
                    <x:DefaultRowHeight>285</x:DefaultRowHeight>
                    <x:Selected/>
                    <x:FreezePanes/>
                    <x:FrozenNoSplit/>
                    <x:SplitHorizontal>1</x:SplitHorizontal>
                    <x:TopRowBottomPane>1</x:TopRowBottomPane>
                    <x:SplitVertical>0</x:SplitVertical>
                    <x:LeftColumnRightPane>0</x:LeftColumnRightPane>
                    <x:ActivePane>0</x:ActivePane>
                    <x:Panes>
                      <x:Pane>
                        <x:Number>3</x:Number>
                      </x:Pane>
                    </x:Panes>
                    <x:ProtectObjects>False</x:ProtectObjects>
                    <x:ProtectScenarios>False</x:ProtectScenarios>
                  </x:WorksheetOptions>
                </x:ExcelWorksheet>
              </x:ExcelWorksheets>
            </x:ExcelWorkbook>
          </xml>
          <![endif]-->
          <style>
            table { border-collapse: collapse; width: 100%; }
            th { background-color: #4472C4; color: white; font-weight: bold; text-align: center; padding: 8px; border: 1px solid #000; }
            td { padding: 6px; border: 1px solid #000; vertical-align: top; }
            .date { text-align: center; }
            .json { font-family: monospace; font-size: 10px; white-space: pre-wrap; }
          </style>
        </head>
        <body>
          <table>
            <thead>
              <tr>
                ${headers.map(header => `<th>${header}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${rows.map(row => 
                `<tr>
                  <td>${row[0]}</td>
                  <td>${row[1]}</td>
                  <td>${row[2]}</td>
                  <td>${row[3]}</td>
                  <td>${row[4]}</td>
                  <td>${row[5]}</td>
                  <td>${row[6]}</td>
                  <td class="json">${row[7]}</td>
                  <td class="json">${row[8]}</td>
                  <td class="date">${row[9]}</td>
                </tr>`
              ).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;

    return excelHtml;
  };

  // Show loading while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <LoadingTimeout timeout={15000}>
          <PageLoader text="Authenticating..." />
        </LoadingTimeout>
      </div>
    );
  }

  // Don't render anything if not authenticated (will redirect)
  if (!user) {
    return null;
  }

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
                    disabled={dataLoading}
                    className="flex items-center gap-2"
                  >
                    <Download className={`h-4 w-4 ${dataLoading ? 'animate-pulse' : ''}`} />
                    {dataLoading ? 'Exporting...' : 'Export to Excel'}
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
