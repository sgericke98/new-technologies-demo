import { useState, useCallback } from 'react';
import { ImportDebugInfo } from '@/lib/importers';

export function useImportDebug() {
  const [debugInfo, setDebugInfo] = useState<ImportDebugInfo | null>(null);
  const [isDebugVisible, setIsDebugVisible] = useState(false);

  const showDebug = useCallback((info: ImportDebugInfo) => {
    setDebugInfo(info);
    setIsDebugVisible(true);
  }, []);

  const hideDebug = useCallback(() => {
    setIsDebugVisible(false);
  }, []);

  const clearDebug = useCallback(() => {
    setDebugInfo(null);
    setIsDebugVisible(false);
  }, []);

  return {
    debugInfo,
    isDebugVisible,
    showDebug,
    hideDebug,
    clearDebug
  };
}
