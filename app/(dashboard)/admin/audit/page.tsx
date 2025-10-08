'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  ArrowLeft, 
  Home, 
  Shield, 
  RefreshCw,
  Download
} from 'lucide-react';
import Link from 'next/link';
import { AuditLogTable } from '@/components/audit/AuditLogTable';
import { PageLoader } from '@/components/ui/loader';
import { LoadingTimeout } from '@/components/ui/loading-timeout';
import { 
  getAuditLogs, 
  AuditLog
} from '@/lib/audit';

export default function AuditPage() {
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
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
      fetchAuditData();
    }
  }, [isAdmin, currentPage]);

  const fetchAuditData = async () => {
    try {
      setDataLoading(true);
      const offset = (currentPage - 1) * ITEMS_PER_PAGE;
      
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout')), 10000)
      );
      
      const auditLogsPromise = getAuditLogs({
        limit: ITEMS_PER_PAGE,
        offset,
        order_by: 'created_at',
        order_direction: 'desc',
      });

      const result = await Promise.race([auditLogsPromise, timeoutPromise]) as { data: any[]; totalCount: number };

      setLogs(result.data);
      
      // Calculate total pages using the actual total count from the database
      const totalPages = Math.max(1, Math.ceil(result.totalCount / ITEMS_PER_PAGE));
      setTotalPages(totalPages);
    } catch (error) {
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

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchAuditData();
      toast({
        title: 'Refreshed',
        description: 'Audit data has been updated',
      });
    } catch (error) {
    } finally {
      setRefreshing(false);
    }
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
      const result = await getAuditLogs({
        limit: 10000, // Large limit to get all data
        order_by: 'created_at',
        order_direction: 'desc',
      });
      const allLogs = result.data;

      // Convert to CSV format (Excel-compatible)
      const csvContent = convertToCSV(allLogs);
      
      // Create and download the file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `audit-logs-${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: 'Export Complete',
        description: `Downloaded ${allLogs.length} audit records`,
      });
    } catch (error) {
      toast({
        title: 'Export Failed',
        description: 'Failed to export audit data',
        variant: 'destructive',
      });
    } finally {
      setDataLoading(false);
    }
  };

  // Helper function to convert audit logs to CSV format
  const convertToCSV = (logs: AuditLog[]) => {
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

    // Helper function to escape CSV values
    const escapeCSV = (value: any): string => {
      if (value === null || value === undefined) return '';
      const stringValue = String(value);
      // Escape quotes and wrap in quotes if contains comma, quote, or newline
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n') || stringValue.includes('\r')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    };

    // Create CSV content
    const csvRows = [
      headers.join(','), // Header row
      ...logs.map(log => [
        escapeCSV(log.id),
        escapeCSV(log.profiles?.name || 'Unknown'),
        escapeCSV(log.profiles?.email || 'Unknown'),
        escapeCSV(log.profiles?.role || 'Unknown'),
        escapeCSV(log.action),
        escapeCSV(log.entity),
        escapeCSV(log.entity_id || ''),
        escapeCSV(log.before ? JSON.stringify(log.before) : ''),
        escapeCSV(log.after ? JSON.stringify(log.after) : ''),
        escapeCSV(new Date(log.created_at).toLocaleString())
      ].join(','))
    ];

    return csvRows.join('\n');
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
                    {dataLoading ? 'Exporting...' : 'Export to CSV'}
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
          <AuditLogTable
            logs={logs}
            loading={dataLoading}
            onRefresh={handleRefresh}
            pagination={{
              page: currentPage,
              totalPages,
              onPageChange: handlePageChange,
            }}
          />
        </div>
      </div>
    </div>
  );
}
