import { useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';
import { toast } from 'sonner';

/**
 * Custom hook to handle real-time updates for the dashboard
 * Subscribes to changes in sellers and relationship_maps tables
 * and automatically invalidates relevant queries to trigger refetch
 */
export function useRealtimeDashboard() {
  const queryClient = useQueryClient();
  const lastUpdateRef = useRef<number>(0);

  useEffect(() => {
    // Create channels for real-time subscriptions
    const channels: RealtimeChannel[] = [];

    // Subscribe to sellers table changes (book_finalized, seller updates, etc.)
    const sellersChannel = supabase
      .channel('dashboard-sellers-changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'sellers',
        },
        async (payload) => {
          console.log('🔄 Realtime: Seller changed', payload);
          
          // Refresh materialized views to sync with real data
          try {
            await supabase.rpc('smart_refresh_performance_views');
          } catch (error) {
            console.error('Error refreshing materialized views:', error);
          }
          
          // Throttle toast notifications to avoid spam (max once every 3 seconds)
          const now = Date.now();
          if (now - lastUpdateRef.current > 3000) {
            toast.info('Dashboard updated', {
              description: 'New data available from another user',
              duration: 2000,
            });
            lastUpdateRef.current = now;
          }
          
          // Invalidate dashboard queries to refetch latest data
          queryClient.invalidateQueries({ queryKey: ['unified-dashboard'], exact: false });
          queryClient.invalidateQueries({ queryKey: ['manager-performance'] });
          queryClient.invalidateQueries({ queryKey: ['sellerRevenue'] });
          
          // If specific seller was updated, invalidate seller-specific queries too
          const newRecord = payload.new as any;
          if (newRecord && newRecord.id) {
            queryClient.invalidateQueries({ queryKey: ['sellerDetail', newRecord.id] });
          }
        }
      )
      .subscribe();

    channels.push(sellersChannel);

    // Subscribe to relationship_maps table changes (account assignments)
    const relationshipsChannel = supabase
      .channel('dashboard-relationships-changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'relationship_maps',
        },
        async (payload) => {
          console.log('🔄 Realtime: Relationship changed', payload);
          
          // Refresh materialized views to sync with real data
          try {
            await supabase.rpc('smart_refresh_performance_views');
          } catch (error) {
            console.error('Error refreshing materialized views:', error);
          }
          
          // Throttle toast notifications to avoid spam (max once every 3 seconds)
          const now = Date.now();
          if (now - lastUpdateRef.current > 3000) {
            toast.info('Dashboard updated', {
              description: 'Account assignments changed by another user',
              duration: 2000,
            });
            lastUpdateRef.current = now;
          }
          
          // Invalidate all dashboard queries since account assignments affect revenue calculations
          queryClient.invalidateQueries({ queryKey: ['unified-dashboard'], exact: false });
          queryClient.invalidateQueries({ queryKey: ['manager-performance'] });
          queryClient.invalidateQueries({ queryKey: ['sellerRevenue'] });
          
          // Invalidate seller-specific queries if seller_id is present
          const newRecord = payload.new as any;
          const oldRecord = payload.old as any;
          const sellerId = newRecord?.seller_id || oldRecord?.seller_id;
          if (sellerId) {
            queryClient.invalidateQueries({ queryKey: ['sellerDetail', sellerId] });
            queryClient.invalidateQueries({ queryKey: ['originalAccounts', sellerId] });
            queryClient.invalidateQueries({ queryKey: ['mustKeepAccounts', sellerId] });
            queryClient.invalidateQueries({ queryKey: ['forDiscussionAccounts', sellerId] });
            queryClient.invalidateQueries({ queryKey: ['toBePeeledAccounts', sellerId] });
            queryClient.invalidateQueries({ queryKey: ['availableAccounts', sellerId] });
            queryClient.invalidateQueries({ queryKey: ['mustKeepPaginated', sellerId] });
            queryClient.invalidateQueries({ queryKey: ['forDiscussionPaginated', sellerId] });
            queryClient.invalidateQueries({ queryKey: ['toBePeeledPaginated', sellerId] });
            queryClient.invalidateQueries({ queryKey: ['originalPaginated', sellerId] });
          }
        }
      )
      .subscribe();

    channels.push(relationshipsChannel);

    // Cleanup function - unsubscribe from all channels when component unmounts
    return () => {
      console.log('🔌 Disconnecting realtime subscriptions');
      channels.forEach((channel) => {
        supabase.removeChannel(channel);
      });
    };
  }, [queryClient]);
}

