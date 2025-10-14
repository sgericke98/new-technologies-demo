import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';
import { toast } from 'sonner';

/**
 * Custom hook to handle real-time updates for a specific seller detail page
 * Subscribes to changes in the seller and their account relationships
 * Enables cross-tab synchronization when multiple users/tabs are viewing the same seller
 */
export function useRealtimeSeller(sellerId: string) {
  const queryClient = useQueryClient();
  const lastUpdateRef = useRef<number>(0);

  useEffect(() => {
    if (!sellerId) return;

    const channels: RealtimeChannel[] = [];

    // Subscribe to changes for this specific seller
    const sellerChannel = supabase
      .channel(`seller-${sellerId}-changes`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sellers',
          filter: `id=eq.${sellerId}`,
        },
        async (payload) => {
          console.log(`🔄 Realtime: Seller ${sellerId} updated`, payload);
          
          // Refresh materialized views to sync with real data
          try {
            await supabase.rpc('refresh_performance_views');
          } catch (error) {
            console.error('Error refreshing materialized views:', error);
          }
          
          // Throttle toast notifications (max once every 3 seconds)
          const now = Date.now();
          if (now - lastUpdateRef.current > 3000) {
            toast.info('Seller updated', {
              description: 'Data synced from another user or tab',
              duration: 2000,
            });
            lastUpdateRef.current = now;
          }
          
          // Invalidate all queries related to this seller
          queryClient.invalidateQueries({ queryKey: ['sellerDetail', sellerId] });
          queryClient.invalidateQueries({ queryKey: ['sellerRevenue', sellerId] });
          
          // Also invalidate dashboard queries
          queryClient.invalidateQueries({ queryKey: ['unified-dashboard'], exact: false });
          queryClient.invalidateQueries({ queryKey: ['manager-performance'] });
        }
      )
      .subscribe();

    channels.push(sellerChannel);

    // Subscribe to relationship changes for this seller's accounts
    const relationshipsChannel = supabase
      .channel(`seller-${sellerId}-relationships`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'relationship_maps',
          filter: `seller_id=eq.${sellerId}`,
        },
        async (payload) => {
          console.log(`🔄 Realtime: Seller ${sellerId} relationships updated`, payload);
          
          // Refresh materialized views to sync with real data
          try {
            await supabase.rpc('refresh_performance_views');
          } catch (error) {
            console.error('Error refreshing materialized views:', error);
          }
          
          // Throttle toast notifications (max once every 3 seconds)
          const now = Date.now();
          if (now - lastUpdateRef.current > 3000) {
            toast.info('Accounts updated', {
              description: 'Account assignments synced from another user or tab',
              duration: 2000,
            });
            lastUpdateRef.current = now;
          }
          
          // Invalidate all account-related queries for this seller
          queryClient.invalidateQueries({ queryKey: ['originalAccounts', sellerId] });
          queryClient.invalidateQueries({ queryKey: ['mustKeepAccounts', sellerId] });
          queryClient.invalidateQueries({ queryKey: ['forDiscussionAccounts', sellerId] });
          queryClient.invalidateQueries({ queryKey: ['toBePeeledAccounts', sellerId] });
          queryClient.invalidateQueries({ queryKey: ['availableAccounts', sellerId] });
          queryClient.invalidateQueries({ queryKey: ['allAccountsWithAssignmentStatus', sellerId] });
          queryClient.invalidateQueries({ queryKey: ['mustKeepPaginated', sellerId] });
          queryClient.invalidateQueries({ queryKey: ['forDiscussionPaginated', sellerId] });
          queryClient.invalidateQueries({ queryKey: ['toBePeeledPaginated', sellerId] });
          queryClient.invalidateQueries({ queryKey: ['originalPaginated', sellerId] });
          queryClient.invalidateQueries({ queryKey: ['sellerDetail', sellerId] });
          queryClient.invalidateQueries({ queryKey: ['sellerRevenue', sellerId] });
          
          // Also invalidate dashboard queries since account assignments affect overall metrics
          queryClient.invalidateQueries({ queryKey: ['unified-dashboard'], exact: false });
          queryClient.invalidateQueries({ queryKey: ['manager-performance'] });
        }
      )
      .subscribe();

    channels.push(relationshipsChannel);

    // Cleanup
    return () => {
      console.log(`🔌 Disconnecting realtime subscriptions for seller ${sellerId}`);
      channels.forEach((channel) => {
        supabase.removeChannel(channel);
      });
    };
  }, [sellerId, queryClient]);
}

