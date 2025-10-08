'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { 
  Eye, 
  Calendar, 
  User, 
  Activity,
  ChevronLeft,
  ChevronRight,
  RefreshCw
} from 'lucide-react';
import { AuditLog } from '@/lib/audit';

interface AuditLogTableProps {
  logs: AuditLog[];
  loading?: boolean;
  onRefresh?: () => void;
  pagination?: {
    page: number;
    totalPages: number;
    onPageChange: (page: number) => void;
  };
}

export function AuditLogTable({ 
  logs, 
  loading = false, 
  onRefresh,
  pagination 
}: AuditLogTableProps) {
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const getActionBadgeVariant = (action: string) => {
    switch (action.toLowerCase()) {
      case 'create':
        return 'default';
      case 'update':
        return 'secondary';
      case 'delete':
        return 'destructive';
      case 'pin':
      case 'assign':
        return 'default';
      case 'unpin':
      case 'unassign':
        return 'outline';
      case 'approve':
        return 'default';
      case 'reject':
        return 'destructive';
      case 'login':
        return 'secondary';
      case 'logout':
        return 'outline';
      case 'settings_update':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const getEntityIcon = (entity: string) => {
    switch (entity.toLowerCase()) {
      case 'seller':
        return '👤';
      case 'account':
        return '🏢';
      case 'relationship':
        return '🔗';
      case 'request':
        return '📋';
      case 'settings':
        return '⚙️';
      case 'user':
        return '👥';
      case 'manager':
        return '👨‍💼';
      default:
        return '📄';
    }
  };

  const formatJsonData = (data: any) => {
    if (!data) return 'No data';
    return JSON.stringify(data, null, 2);
  };

  const getChangesSummary = (before: any, after: any) => {
    if (!before && !after) return 'No changes';
    if (!before) return 'Created new record';
    if (!after) return 'Deleted record';
    
    const beforeKeys = Object.keys(before || {});
    const afterKeys = Object.keys(after || {});
    const allKeys = Array.from(new Set([...beforeKeys, ...afterKeys]));
    
    const changes = allKeys.filter(key => {
      const beforeVal = before?.[key];
      const afterVal = after?.[key];
      return JSON.stringify(beforeVal) !== JSON.stringify(afterVal);
    });

    return changes.length > 0 ? `${changes.length} field(s) changed` : 'No changes';
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-16">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 animate-spin" />
            <span>Loading audit logs...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Audit Trail</CardTitle>
              <CardDescription>
                Track all changes made to the system
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {onRefresh && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRefresh}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Audit Logs Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Changes</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                      No audit logs found
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-slate-400" />
                          <span className="text-sm">
                            {format(new Date(log.created_at), 'MMM dd, yyyy HH:mm')}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-slate-400" />
                          <div>
                            <div className="font-medium text-sm">
                              {log.profiles?.name || 'Unknown User'}
                            </div>
                            <div className="text-xs text-slate-500">
                              {log.profiles?.email || 'No email'}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getActionBadgeVariant(log.action)}>
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{getEntityIcon(log.entity)}</span>
                          <span className="font-medium">{log.entity}</span>
                          {log.entity_id && (
                            <span className="text-xs text-slate-500">
                              {log.entity_id.slice(0, 8)}...
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-slate-600">
                          {getChangesSummary(log.before, log.after)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedLog(log)}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              View
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-4xl max-h-[80vh]">
                            <DialogHeader>
                              <DialogTitle className="flex items-center gap-2">
                                <Activity className="h-5 w-5" />
                                Audit Log Details
                              </DialogTitle>
                              <DialogDescription>
                                Detailed information about this audit event
                              </DialogDescription>
                            </DialogHeader>
                            
                            <ScrollArea className="max-h-[60vh]">
                              <div className="space-y-6">
                                {/* Basic Info */}
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <Label className="text-sm font-medium">Timestamp</Label>
                                    <p className="text-sm text-slate-600">
                                      {format(new Date(log.created_at), 'PPpp')}
                                    </p>
                                  </div>
                                  <div>
                                    <Label className="text-sm font-medium">User</Label>
                                    <p className="text-sm text-slate-600">
                                      {log.profiles?.name || 'Unknown User'}
                                    </p>
                                  </div>
                                  <div>
                                    <Label className="text-sm font-medium">Action</Label>
                                    <Badge variant={getActionBadgeVariant(log.action)}>
                                      {log.action}
                                    </Badge>
                                  </div>
                                  <div>
                                    <Label className="text-sm font-medium">Entity</Label>
                                    <p className="text-sm text-slate-600">
                                      {getEntityIcon(log.entity)} {log.entity}
                                    </p>
                                  </div>
                                </div>

                                <Separator />

                                {/* Before/After Data */}
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                  <div>
                                    <Label className="text-sm font-medium">Before</Label>
                                    <div className="mt-2 p-3 bg-slate-50 rounded-lg">
                                      <pre className="text-xs text-slate-600 whitespace-pre-wrap">
                                        {formatJsonData(log.before)}
                                      </pre>
                                    </div>
                                  </div>
                                  <div>
                                    <Label className="text-sm font-medium">After</Label>
                                    <div className="mt-2 p-3 bg-slate-50 rounded-lg">
                                      <pre className="text-xs text-slate-600 whitespace-pre-wrap">
                                        {formatJsonData(log.after)}
                                      </pre>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </ScrollArea>
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {pagination && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-500">
            Page {pagination.page} of {pagination.totalPages}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
