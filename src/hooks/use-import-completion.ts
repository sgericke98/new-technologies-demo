import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Hook to listen for import completion events and invalidate queries
 */
export function useImportCompletion() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const handleImportCompleted = (event: CustomEvent) => {
      const { totalImported, totalErrors, timestamp, error } = event.detail;
      
      console.log('🔄 Import completed event received:', {
        totalImported,
        totalErrors,
        timestamp,
        error
      });

      // Invalidate all dashboard-related queries with broader patterns
      queryClient.invalidateQueries({
        queryKey: ['dashboard']
      });
      
      queryClient.invalidateQueries({
        queryKey: ['sellers']
      });
      
      queryClient.invalidateQueries({
        queryKey: ['accounts']
      });
      
      queryClient.invalidateQueries({
        queryKey: ['relationships']
      });
      
      queryClient.invalidateQueries({
        queryKey: ['managers']
      });
      
      queryClient.invalidateQueries({
        queryKey: ['performance-views']
      });
      
      // Invalidate relationship-specific queries
      queryClient.invalidateQueries({
        queryKey: ['relationship_maps']
      });
      
      queryClient.invalidateQueries({
        queryKey: ['seller_managers']
      });
      
      // Invalidate materialized view queries
      queryClient.invalidateQueries({
        queryKey: ['mv_seller_performance']
      });
      
      queryClient.invalidateQueries({
        queryKey: ['mv_unified_dashboard']
      });
      
      // Invalidate all queries to be safe
      queryClient.invalidateQueries();

      console.log('✅ All dashboard queries invalidated');
    };

    // Listen for import completion events
    window.addEventListener('import-completed', handleImportCompleted as EventListener);

    return () => {
      window.removeEventListener('import-completed', handleImportCompleted as EventListener);
    };
  }, [queryClient]);
}
