import { useImportStatus } from '@/hooks/use-import-status';
import { useEffect, useState } from 'react';

interface DashboardWithImportProtectionProps {
  children: React.ReactNode;
  refreshInterval?: number; // in milliseconds
}

export function DashboardWithImportProtection({ 
  children, 
  refreshInterval = 30000 // 30 seconds default
}: DashboardWithImportProtectionProps) {
  const { isImporting } = useImportStatus();
  const [shouldRefresh, setShouldRefresh] = useState(true);

  useEffect(() => {
    // Disable refresh during imports
    if (isImporting) {
      setShouldRefresh(false);
      console.log('🛑 Dashboard refresh disabled - import in progress');
      return;
    }

    // Enable refresh when import is complete
    setShouldRefresh(true);
    console.log('✅ Dashboard refresh enabled - no active imports');
  }, [isImporting]);

  useEffect(() => {
    if (!shouldRefresh) return;

    // Set up interval for dashboard refreshes
    const interval = setInterval(() => {
      if (shouldRefresh && !isImporting) {
        // Trigger dashboard refresh here
        console.log('🔄 Refreshing dashboard...');
        // Add your dashboard refresh logic here
      }
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [shouldRefresh, isImporting, refreshInterval]);

  return (
    <div>
      {isImporting && (
        <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-yellow-500 border-t-transparent"></div>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium">
                Import in progress - Dashboard refreshes disabled to prevent conflicts
              </p>
            </div>
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
