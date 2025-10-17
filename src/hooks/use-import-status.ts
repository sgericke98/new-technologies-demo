import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ImportStatus {
  id: string;
  is_importing: boolean;
  started_at: string;
  user_id: string;
}

export function useImportStatus() {
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<ImportStatus | null>(null);

  useEffect(() => {
    // Check import status on mount
    checkImportStatus();

    // Set up real-time subscription to import status
    const channel = supabase
      .channel('import_status_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'import_status'
        },
        (payload) => {
          console.log('Import status changed:', payload);
          if (payload.new) {
            const newStatus = payload.new as ImportStatus;
            setImportStatus(newStatus);
            setIsImporting(newStatus.is_importing);
          } else {
            setImportStatus(null);
            setIsImporting(false);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const checkImportStatus = async () => {
    try {
      const { data, error } = await supabase
        .from('import_status')
        .select('*')
        .eq('id', 'current_import')
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error checking import status:', error);
        return;
      }

      if (data) {
        setImportStatus(data);
        setIsImporting(data.is_importing);
      } else {
        setImportStatus(null);
        setIsImporting(false);
      }
    } catch (error) {
      console.error('Error checking import status:', error);
    }
  };

  return {
    isImporting,
    importStatus,
    checkImportStatus
  };
}
