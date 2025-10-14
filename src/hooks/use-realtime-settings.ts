import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';
import { toast } from 'sonner';

/**
 * Custom hook to handle real-time updates for admin settings
 * Subscribes to changes in revenue_range_settings and account_number_settings tables
 * Ensures all admins see settings changes in real-time
 */
export function useRealtimeSettings(onSettingsChanged?: () => void) {
  const queryClient = useQueryClient();
  const lastUpdateRef = useRef<number>(0);

  useEffect(() => {
    const channels: RealtimeChannel[] = [];

    // Subscribe to revenue_range_settings table changes
    const revenueSettingsChannel = supabase
      .channel('settings-revenue-range-changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'revenue_range_settings',
        },
        async (payload) => {
          
          // Refresh materialized views since health indicators depend on these settings
          try {
            await supabase.rpc('refresh_performance_views');
          } catch (error) {
            console.error('Error refreshing materialized views:', error);
          }
          
          // Throttle toast notifications (max once every 3 seconds)
          const now = Date.now();
          if (now - lastUpdateRef.current > 3000) {
            toast.info('Settings updated', {
              description: 'Revenue thresholds changed by another admin',
              duration: 2000,
            });
            lastUpdateRef.current = now;
          }
          
          // Call callback if provided (to reload settings in the UI)
          if (onSettingsChanged) {
            onSettingsChanged();
          }
          
          // Invalidate all dashboard queries since health indicators are recalculated
          queryClient.invalidateQueries({ queryKey: ['unified-dashboard'], exact: false });
          queryClient.invalidateQueries({ queryKey: ['manager-performance'] });
          queryClient.invalidateQueries({ queryKey: ['sellerRevenue'] });
        }
      )
      .subscribe();

    channels.push(revenueSettingsChannel);

    // Subscribe to account_number_settings table changes
    const accountSettingsChannel = supabase
      .channel('settings-account-number-changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'account_number_settings',
        },
        async (payload) => {
          
          // Refresh materialized views since health indicators depend on these settings
          try {
            await supabase.rpc('refresh_performance_views');
          } catch (error) {
            console.error('Error refreshing materialized views:', error);
          }
          
          // Throttle toast notifications (max once every 3 seconds)
          const now = Date.now();
          if (now - lastUpdateRef.current > 3000) {
            toast.info('Settings updated', {
              description: 'Account limits changed by another admin',
              duration: 2000,
            });
            lastUpdateRef.current = now;
          }
          
          // Call callback if provided (to reload settings in the UI)
          if (onSettingsChanged) {
            onSettingsChanged();
          }
          
          // Invalidate all dashboard queries since health indicators are recalculated
          queryClient.invalidateQueries({ queryKey: ['unified-dashboard'], exact: false });
          queryClient.invalidateQueries({ queryKey: ['manager-performance'] });
          queryClient.invalidateQueries({ queryKey: ['sellerRevenue'] });
        }
      )
      .subscribe();

    channels.push(accountSettingsChannel);

    // Cleanup function - unsubscribe from all channels when component unmounts
    return () => {
      channels.forEach((channel) => {
        supabase.removeChannel(channel);
      });
    };
  }, [queryClient, onSettingsChanged]);
}

