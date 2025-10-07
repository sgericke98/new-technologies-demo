'use client';

import { useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { RefreshCw, AlertTriangle } from 'lucide-react';

interface LoadingTimeoutProps {
  timeout?: number; // in milliseconds
  onTimeout?: () => void;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function LoadingTimeout({ 
  timeout = 15000, // 15 seconds default
  onTimeout,
  children,
  fallback
}: LoadingTimeoutProps) {
  const [hasTimedOut, setHasTimedOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setHasTimedOut(true);
      onTimeout?.();
    }, timeout);

    return () => clearTimeout(timer);
  }, [timeout, onTimeout]);

  if (hasTimedOut) {
    return fallback || (
      <div className="flex flex-col items-center justify-center p-8 space-y-4">
        <Alert className="max-w-md">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Loading is taking longer than expected. This might be due to a large dataset or network issues.
          </AlertDescription>
        </Alert>
        <Button 
          variant="outline" 
          onClick={() => window.location.reload()}
          className="flex items-center gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh Page
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
