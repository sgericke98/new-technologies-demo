'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Save, Settings, DollarSign, Building2, AlertTriangle, CheckCircle, ArrowLeft, Home, Shield, Upload, Download } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/integrations/supabase/client';
import { logAuditEvent, createAuditLogData, AUDIT_ACTIONS, AUDIT_ENTITIES } from '@/lib/audit';
import {
  downloadComprehensiveTemplate,
  importComprehensiveData,
} from '@/lib/importers';

interface ThresholdSettings {
  revenue_threshold: number;
  account_threshold: number;
  id?: string;
}

export default function AdminSettingsPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [settings, setSettings] = useState<ThresholdSettings>({
    revenue_threshold: 10_000_000,
    account_threshold: 5,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [comprehensiveImporting, setComprehensiveImporting] = useState(false);
  const [importResults, setImportResults] = useState<any>(null);
  
  // File input ref for comprehensive import
  const comprehensiveInputRef = useRef<HTMLInputElement>(null);

  // Redirect non-MASTER users to dashboard
  useEffect(() => {
    if (!authLoading && (!user || !profile || profile.role !== 'MASTER')) {
      router.push('/dashboard');
    }
  }, [user, profile, authLoading, router]);

  // Check if user is MASTER admin
  const isMasterAdmin = profile?.role === 'MASTER';

  useEffect(() => {
    if (isMasterAdmin) {
      fetchSettings();
    }
  }, [isMasterAdmin]);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('threshold_settings')
        .select('*')
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
        console.error('Error fetching settings:', error);
        return;
      }

      if (data) {
        setSettings({
          revenue_threshold: data.revenue_threshold || 10_000_000,
          account_threshold: data.account_threshold || 5,
          id: data.id,
        });
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!isMasterAdmin) {
      toast({
        title: 'Access Denied',
        description: 'You do not have permission to modify settings.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const settingsData = {
        revenue_threshold: settings.revenue_threshold,
        account_threshold: settings.account_threshold,
        updated_at: new Date().toISOString(),
      };

      console.log('Saving settings:', settingsData);
      console.log('Settings ID:', settings.id);

      // Store previous values for audit log
      const previousSettings = settings.id ? settings : null;

      let result;
      if (settings.id) {
        // Update existing settings
        console.log('Updating existing settings...');
        result = await supabase
          .from('threshold_settings')
          .update(settingsData)
          .eq('id', settings.id)
          .select();
      } else {
        // Create new settings
        console.log('Creating new settings...');
        result = await supabase
          .from('threshold_settings')
          .insert(settingsData)
          .select();
      }

      console.log('Database result:', result);

      if (result.error) {
        console.error('Database error:', result.error);
        throw new Error(`Database error: ${result.error.message}`);
      }

      // Update local state with the returned data
      if (result.data && result.data.length > 0) {
        setSettings(prev => ({
          ...prev,
          id: result.data[0].id
        }));
      }

      // Log audit event
      if (user?.id) {
        const auditData = createAuditLogData(
          user.id,
          settings.id ? AUDIT_ACTIONS.UPDATE : AUDIT_ACTIONS.CREATE,
          AUDIT_ENTITIES.SETTINGS,
          result.data?.[0]?.id,
          previousSettings,
          result.data?.[0]
        );
        
        await logAuditEvent(auditData);
      }

      toast({
        title: 'Settings Saved',
        description: 'Threshold settings have been updated successfully.',
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: 'Error',
        description: `Failed to save settings: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return amount >= 1_000_000 
      ? `$${(amount / 1_000_000).toFixed(1)}M`
      : amount >= 1_000 
      ? `$${(amount / 1_000).toFixed(0)}K`
      : `$${amount.toFixed(0)}`;
  };

  // Comprehensive import handler
  async function handleComprehensiveImport(file?: File | null) {
    if (!file) return;
    try {
      setComprehensiveImporting(true);
      setImportResults(null);
      const userId = profile?.id;
      const results = await importComprehensiveData(file, userId);
      setImportResults(results);
      
      const totalImported = Object.values(results).reduce((sum: number, result: any) => sum + result.imported, 0);
      const totalErrors = Object.values(results).reduce((sum: number, result: any) => sum + result.errors.length, 0);
      
      toast({
        title: "Comprehensive Import Complete",
        description: `Imported ${totalImported} records with ${totalErrors} errors.`,
        variant: totalErrors > 0 ? "destructive" : "default",
      });
    } catch (e: any) {
      toast({
        title: "Comprehensive Import Failed",
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    } finally {
      setComprehensiveImporting(false);
    }
  }

  if (!isMasterAdmin) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                Access Denied
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-600">
                You do not have permission to access admin settings. 
                Only administrators can modify system thresholds.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardContent className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Show loading while checking authentication
  if (authLoading || (!user || !profile || profile.role !== 'MASTER')) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Header with Navigation */}
          <div className="mb-8">
            <div className="flex items-center gap-4 mb-6">
              <Link 
                href="/dashboard"
                className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="text-sm font-medium">Back to Dashboard</span>
              </Link>
              <Separator orientation="vertical" className="h-6" />
              <Link 
                href="/dashboard"
                className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
              >
                <Home className="h-4 w-4" />
                <span className="text-sm font-medium">Dashboard</span>
              </Link>
            </div>
            
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 border border-slate-200 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-purple-100 rounded-xl">
                  <Settings className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-slate-900">Admin Settings</h1>
                  <p className="text-slate-600 mt-1">
                    Configure system thresholds and health indicators for seller performance monitoring.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Settings Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue Threshold Settings */}
            <Card className="bg-white/80 backdrop-blur-sm border-slate-200 shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-3 text-lg">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <DollarSign className="h-5 w-5 text-green-600" />
                  </div>
                  Revenue Threshold
                </CardTitle>
                <CardDescription className="text-slate-600">
                  Set the minimum revenue threshold for seller health indicators.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <Label htmlFor="revenue-threshold" className="text-sm font-medium text-slate-700">
                    Minimum Revenue
                  </Label>
                  <div className="flex items-center gap-3">
                    <Input
                      id="revenue-threshold"
                      type="text"
                      value={settings.revenue_threshold.toLocaleString()}
                      onChange={(e) => {
                        const value = e.target.value.replace(/,/g, '');
                        const numValue = parseInt(value) || 0;
                        setSettings(prev => ({
                          ...prev,
                          revenue_threshold: numValue
                        }));
                      }}
                      className="flex-1 h-11 text-lg font-medium"
                      placeholder="10,000,000"
                    />
                    <Badge variant="outline" className="whitespace-nowrap px-3 py-1 bg-green-50 text-green-700 border-green-200">
                      {formatCurrency(settings.revenue_threshold)}
                    </Badge>
                  </div>
                  <p className="text-sm text-slate-500 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    Sellers below this threshold will show red indicators.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Account Threshold Settings */}
            <Card className="bg-white/80 backdrop-blur-sm border-slate-200 shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-3 text-lg">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Building2 className="h-5 w-5 text-blue-600" />
                  </div>
                  Account Threshold
                </CardTitle>
                <CardDescription className="text-slate-600">
                  Set the maximum number of accounts for seller health indicators.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <Label htmlFor="account-threshold" className="text-sm font-medium text-slate-700">
                    Maximum Accounts
                  </Label>
                  <div className="flex items-center gap-3">
                    <Input
                      id="account-threshold"
                      type="number"
                      value={settings.account_threshold}
                      onChange={(e) => setSettings(prev => ({
                        ...prev,
                        account_threshold: parseInt(e.target.value) || 0
                      }))}
                      className="flex-1 h-11 text-lg font-medium"
                      placeholder="5"
                    />
                    <Badge variant="outline" className="whitespace-nowrap px-3 py-1 bg-blue-50 text-blue-700 border-blue-200">
                      {settings.account_threshold} accounts
                    </Badge>
                  </div>
                  <p className="text-sm text-slate-500 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    Sellers above this limit will show red indicators.
                  </p>
                </div>
              </CardContent>
          </Card>
        </div>

        {/* Comprehensive Data Import Section */}
        <Card className="bg-white/80 backdrop-blur-sm border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-3 text-lg">
              <div className="p-2 bg-green-100 rounded-lg">
                <Upload className="h-5 w-5 text-green-600" />
              </div>
              Comprehensive Data Import
            </CardTitle>
            <CardDescription className="text-slate-600">
              Import all data with a single Excel file containing multiple tabs. This is the recommended approach for bulk data imports.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Comprehensive Import Section */}
            <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-green-900">Single File Import</h3>
                  <p className="text-sm text-green-700">Import all data types with one comprehensive Excel file</p>
                </div>
              </div>
              
              <div className="flex gap-3 mb-4">
                <Button
                  onClick={() => downloadComprehensiveTemplate()}
                  className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white"
                >
                  <Download className="h-4 w-4" />
                  Download Complete Template
                </Button>
                <Button
                  variant="outline"
                  onClick={() => comprehensiveInputRef.current?.click()}
                  disabled={comprehensiveImporting}
                  className="flex items-center gap-2"
                >
                  <Upload className="h-4 w-4" />
                  {comprehensiveImporting ? "Importing..." : "Import Complete File"}
                </Button>
              </div>
              
              <input
                ref={comprehensiveInputRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => handleComprehensiveImport(e.target.files?.[0] ?? null)}
              />
              
              <div className="text-sm text-green-800">
                <p className="font-medium mb-2">Template includes:</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>Instructions tab with complete import guide</li>
                  <li>Accounts tab with revenue data</li>
                  <li>Sellers tab with manager assignments</li>
                  <li>Managers tab (requires existing user profiles)</li>
                  <li>Relationship_Map tab for account-seller relationships</li>
                  <li>Manager_Team tab for team assignments</li>
                </ul>
              </div>
            </div>

            {/* Import Results */}
            {importResults && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <h4 className="font-semibold text-slate-900 mb-3">Import Results</h4>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                  {Object.entries(importResults).map(([key, result]: [string, any]) => (
                    <div key={key} className="text-center">
                      <div className="font-medium text-slate-700 capitalize">{key}</div>
                      <div className="text-2xl font-bold text-green-600">{result.imported}</div>
                      {result.errors.length > 0 && (
                        <div className="text-xs text-red-600">{result.errors.length} errors</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

          </CardContent>
        </Card>

        {/* Preview Section */}
          <Card className="mt-8 bg-white/80 backdrop-blur-sm border-slate-200 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-3 text-lg">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Settings className="h-5 w-5 text-purple-600" />
                </div>
                Health Indicator Preview
              </CardTitle>
              <CardDescription className="text-slate-600">
                See how the indicators will appear with current settings.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Healthy Example */}
                <div className="space-y-4">
                  <h4 className="font-semibold text-green-700 flex items-center gap-2 text-base">
                    <CheckCircle className="h-5 w-5" />
                    Healthy Seller
                  </h4>
                  <div className="space-y-3">
                    <div className="bg-gradient-to-r from-green-50 to-green-100 rounded-xl p-4 border border-green-200 shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-100 rounded-lg">
                          <DollarSign className="h-5 w-5 text-green-600" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-xl font-bold text-slate-900">
                              {formatCurrency(settings.revenue_threshold + 2_000_000)}
                            </p>
                            <div className="w-3 h-3 rounded-full bg-green-500" />
                          </div>
                          <p className="text-sm text-slate-600">Total Revenue ✓</p>
                        </div>
                      </div>
                    </div>
                    <div className="bg-gradient-to-r from-green-50 to-green-100 rounded-xl p-4 border border-green-200 shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-100 rounded-lg">
                          <Building2 className="h-5 w-5 text-green-600" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-xl font-bold text-slate-900">{settings.account_threshold - 1}</p>
                            <div className="w-3 h-3 rounded-full bg-green-500" />
                          </div>
                          <p className="text-sm text-slate-600">Total Accounts ✓</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Warning Example */}
                <div className="space-y-4">
                  <h4 className="font-semibold text-red-700 flex items-center gap-2 text-base">
                    <AlertTriangle className="h-5 w-5" />
                    Needs Attention
                  </h4>
                  <div className="space-y-3">
                    <div className="bg-gradient-to-r from-red-50 to-red-100 rounded-xl p-4 border border-red-200 shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-red-100 rounded-lg">
                          <DollarSign className="h-5 w-5 text-red-600" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-xl font-bold text-slate-900">
                              {formatCurrency(settings.revenue_threshold - 2_000_000)}
                            </p>
                            <div className="w-3 h-3 rounded-full bg-red-500" />
                          </div>
                          <p className="text-sm text-slate-600">Total Revenue ⚠️</p>
                          <p className="text-xs text-red-600 mt-1">
                            Below {formatCurrency(settings.revenue_threshold)} threshold
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="bg-gradient-to-r from-red-50 to-red-100 rounded-xl p-4 border border-red-200 shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-red-100 rounded-lg">
                          <Building2 className="h-5 w-5 text-red-600" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-xl font-bold text-slate-900">{settings.account_threshold + 2}</p>
                            <div className="w-3 h-3 rounded-full bg-red-500" />
                          </div>
                          <p className="text-sm text-slate-600">Total Accounts ⚠️</p>
                          <p className="text-xs text-red-600 mt-1">
                            Over {settings.account_threshold} account limit
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="mt-8 flex justify-between">
            <Link href="/admin/audit">
              <Button 
                variant="outline"
                className="flex items-center gap-2 px-6 py-3 text-lg font-medium"
              >
                <Shield className="h-5 w-5" />
                View Audit Trail
              </Button>
            </Link>
            
            <Button 
              onClick={handleSave} 
              disabled={saving}
              className="flex items-center gap-2 px-8 py-3 text-lg font-medium bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white shadow-lg hover:shadow-xl transition-all duration-200"
            >
              <Save className="h-5 w-5" />
              {saving ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
