import { useSmartRefresh } from '@/hooks/use-smart-refresh';
import { useEffect, useState } from 'react';

interface SmartDashboardProps {
  children: React.ReactNode;
  refreshInterval?: number;
}

export function SmartDashboard({ children, refreshInterval = 30000 }: SmartDashboardProps) {
  const { isRefreshing, skipReason, isSkipping } = useSmartRefresh(refreshInterval);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  useEffect(() => {
    if (!isSkipping && !isRefreshing) {
      setLastRefresh(new Date());
    }
  }, [isSkipping, isRefreshing]);

  return (
    <div>
      {/* Import Status Indicator */}
      {isSkipping && (
        <div className="bg-blue-100 border-l-4 border-blue-500 text-blue-700 p-4 mb-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <div className="animate-pulse rounded-full h-5 w-5 bg-blue-500"></div>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium">
                {skipReason}
              </p>
              <p className="text-xs mt-1">
                Dashboard refreshes paused to prevent conflicts with data import
              </p>
            </div>
          </div>
        </div>
      )}
      
      {/* Refresh Status Indicator */}
      {isRefreshing && (
        <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-2 mb-4">
          <div className="flex items-center">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-green-500 border-t-transparent mr-2"></div>
            <span className="text-sm">Refreshing dashboard data...</span>
          </div>
        </div>
      )}
      
      {/* Last Refresh Time */}
      {lastRefresh && !isSkipping && (
        <div className="text-xs text-gray-500 mb-2">
          Last refreshed: {lastRefresh.toLocaleTimeString()}
        </div>
      )}
      
      {children}
    </div>
  );
}
