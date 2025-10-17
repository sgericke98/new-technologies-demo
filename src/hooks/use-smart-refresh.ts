import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useSmartRefresh(intervalMs: number = 30000) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [skipReason, setSkipReason] = useState<string | null>(null);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        // Proceed with smart refresh (it handles lock checking internally)
        setIsRefreshing(true);
        setSkipReason(null);
        
        const { error: refreshError } = await supabase.rpc('smart_refresh_performance_views');
        
        if (refreshError) {
          console.error('Error refreshing views:', refreshError);
          setSkipReason('Refresh skipped - import may be in progress');
        } else {
          console.log('✅ Materialized views refreshed successfully');
        }
        
      } catch (error) {
        console.error('Error in smart refresh:', error);
        setSkipReason('Refresh error occurred');
      } finally {
        setIsRefreshing(false);
      }
    }, intervalMs);

    return () => clearInterval(interval);
  }, [intervalMs]);

  return {
    isRefreshing,
    skipReason,
    isSkipping: !!skipReason
  };
}
