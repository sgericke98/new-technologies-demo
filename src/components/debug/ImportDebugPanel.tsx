import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

interface ImportDebugInfo {
  totalStartTime: number;
  totalEndTime?: number;
  totalDuration?: number;
  steps: Array<{
    step: string;
    startTime: number;
    endTime?: number;
    duration?: number;
    recordsProcessed?: number;
    batchSize?: number;
    errors?: string[];
  }>;
  connectionPoolHistory: Array<{ timestamp: number; status: string }>;
  memoryHistory: Array<{ timestamp: number; usage: number }>;
  errorHistory: Array<{ timestamp: number; error: string; step: string }>;
}

interface ImportDebugPanelProps {
  debugInfo: ImportDebugInfo | null;
  isVisible: boolean;
  onClose: () => void;
}

export function ImportDebugPanel({ debugInfo, isVisible, onClose }: ImportDebugPanelProps) {
  if (!isVisible || !debugInfo) return null;

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formatMemory = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  const getStepStatus = (step: any) => {
    if (step.errors && step.errors.length > 0) return 'error';
    if (step.duration && step.duration > 10000) return 'slow';
    return 'success';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'error': return 'destructive';
      case 'slow': return 'secondary';
      case 'success': return 'default';
      default: return 'outline';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-auto">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>🔍 Import Performance Debug</span>
            <button 
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {formatDuration(debugInfo.totalDuration || 0)}
              </div>
              <div className="text-sm text-muted-foreground">Total Duration</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {debugInfo.steps.length}
              </div>
              <div className="text-sm text-muted-foreground">Steps</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">
                {debugInfo.connectionPoolHistory.length}
              </div>
              <div className="text-sm text-muted-foreground">Pool Events</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">
                {debugInfo.errorHistory.length}
              </div>
              <div className="text-sm text-muted-foreground">Errors</div>
            </div>
          </div>

          {/* Steps Timeline */}
          <div>
            <h3 className="text-lg font-semibold mb-3">📋 Import Steps</h3>
            <div className="space-y-2">
              {debugInfo.steps.map((step, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center space-x-3">
                    <Badge variant={getStatusColor(getStepStatus(step))}>
                      {getStepStatus(step)}
                    </Badge>
                    <span className="font-medium">{step.step}</span>
                    {step.recordsProcessed && (
                      <span className="text-sm text-muted-foreground">
                        ({step.recordsProcessed} records)
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm">
                      {formatDuration(step.duration || 0)}
                    </div>
                    {step.batchSize && (
                      <div className="text-xs text-muted-foreground">
                        batch: {step.batchSize}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Performance Analysis */}
          <div>
            <h3 className="text-lg font-semibold mb-3">⚡ Performance Analysis</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Slowest Steps */}
              <div>
                <h4 className="font-medium mb-2">🐌 Slowest Steps</h4>
                <div className="space-y-1">
                  {debugInfo.steps
                    .filter(step => step.duration && step.duration > 1000)
                    .sort((a, b) => (b.duration || 0) - (a.duration || 0))
                    .slice(0, 3)
                    .map((step, index) => (
                      <div key={index} className="flex justify-between text-sm">
                        <span>{step.step}</span>
                        <span className="font-mono">{formatDuration(step.duration || 0)}</span>
                      </div>
                    ))}
                </div>
              </div>

              {/* Memory Usage */}
              <div>
                <h4 className="font-medium mb-2">💾 Memory Usage</h4>
                <div className="space-y-1">
                  {debugInfo.memoryHistory.length > 0 && (
                    <>
                      <div className="flex justify-between text-sm">
                        <span>Peak Usage</span>
                        <span className="font-mono">
                          {formatMemory(Math.max(...debugInfo.memoryHistory.map(m => m.usage)))}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Current Usage</span>
                        <span className="font-mono">
                          {formatMemory(debugInfo.memoryHistory[debugInfo.memoryHistory.length - 1]?.usage || 0)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Errors */}
          {debugInfo.errorHistory.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3">❌ Errors</h3>
              <div className="space-y-2">
                {debugInfo.errorHistory.map((error, index) => (
                  <div key={index} className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium text-red-800">{error.step}</div>
                        <div className="text-sm text-red-600 mt-1">{error.error}</div>
                      </div>
                      <div className="text-xs text-red-500">
                        {new Date(error.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Connection Pool Events */}
          {debugInfo.connectionPoolHistory.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3">🔗 Connection Pool Events</h3>
              <div className="space-y-1">
                {debugInfo.connectionPoolHistory.slice(-10).map((event, index) => (
                  <div key={index} className="flex justify-between text-sm">
                    <span>{event.status}</span>
                    <span className="text-muted-foreground">
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
