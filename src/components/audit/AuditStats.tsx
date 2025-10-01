'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Activity, 
  Users, 
  Database, 
  TrendingUp,
  Clock,
  Shield,
  Settings,
  UserCheck
} from 'lucide-react';

interface AuditStatsProps {
  stats: {
    total_logs: number;
    logs_by_action: Record<string, number>;
    logs_by_entity: Record<string, number>;
    logs_by_user: Record<string, number>;
  };
  loading?: boolean;
}

export function AuditStats({ stats, loading = false }: AuditStatsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="animate-pulse">
                <div className="h-4 bg-slate-200 rounded w-3/4 mb-2"></div>
                <div className="h-8 bg-slate-200 rounded w-1/2"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

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

  const getActionColor = (action: string) => {
    switch (action.toLowerCase()) {
      case 'create':
        return 'bg-green-100 text-green-800';
      case 'update':
        return 'bg-blue-100 text-blue-800';
      case 'delete':
        return 'bg-red-100 text-red-800';
      case 'pin':
      case 'assign':
        return 'bg-purple-100 text-purple-800';
      case 'unpin':
      case 'unassign':
        return 'bg-orange-100 text-orange-800';
      case 'approve':
        return 'bg-green-100 text-green-800';
      case 'reject':
        return 'bg-red-100 text-red-800';
      case 'login':
        return 'bg-blue-100 text-blue-800';
      case 'logout':
        return 'bg-gray-100 text-gray-800';
      case 'settings_update':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const topActions = Object.entries(stats.logs_by_action)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  const topEntities = Object.entries(stats.logs_by_entity)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  const topUsers = Object.entries(stats.logs_by_user)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-600">Total Logs</p>
                <p className="text-3xl font-bold text-blue-900">{stats.total_logs.toLocaleString()}</p>
              </div>
              <div className="p-3 bg-blue-200 rounded-full">
                <Database className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-600">Unique Actions</p>
                <p className="text-3xl font-bold text-green-900">{Object.keys(stats.logs_by_action).length}</p>
              </div>
              <div className="p-3 bg-green-200 rounded-full">
                <Activity className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-purple-600">Entity Types</p>
                <p className="text-3xl font-bold text-purple-900">{Object.keys(stats.logs_by_entity).length}</p>
              </div>
              <div className="p-3 bg-purple-200 rounded-full">
                <Shield className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-orange-600">Active Users</p>
                <p className="text-3xl font-bold text-orange-900">{Object.keys(stats.logs_by_user).length}</p>
              </div>
              <div className="p-3 bg-orange-200 rounded-full">
                <Users className="h-6 w-6 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="h-5 w-5" />
              Top Actions
            </CardTitle>
            <CardDescription>
              Most frequently performed actions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topActions.map(([action, count]) => (
                <div key={action} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge className={getActionColor(action)}>
                      {action}
                    </Badge>
                  </div>
                  <div className="text-sm font-medium text-slate-600">
                    {count.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Top Entities */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Database className="h-5 w-5" />
              Top Entities
            </CardTitle>
            <CardDescription>
              Most frequently modified entities
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topEntities.map(([entity, count]) => (
                <div key={entity} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{getEntityIcon(entity)}</span>
                    <span className="font-medium capitalize">{entity}</span>
                  </div>
                  <div className="text-sm font-medium text-slate-600">
                    {count.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Top Users */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <UserCheck className="h-5 w-5" />
              Most Active Users
            </CardTitle>
            <CardDescription>
              Users with the most audit events
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topUsers.map(([userId, count]) => (
                <div key={userId} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center">
                      <Users className="h-4 w-4 text-slate-600" />
                    </div>
                    <span className="font-medium text-sm">
                      {userId.slice(0, 8)}...
                    </span>
                  </div>
                  <div className="text-sm font-medium text-slate-600">
                    {count.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
