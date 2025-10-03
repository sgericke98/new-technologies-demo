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
import { PageLoader } from '@/components/ui/loader';

interface ThresholdSettings {
  id?: string;
}

interface RevenueRangeSettings {
  id?: string;
  size_type: 'midmarket' | 'enterprise';
  seniority_type: 'junior' | 'senior';
  min_revenue: number;
  max_revenue: number;
}

interface RevenueRangeSettingsState {
  midmarketJunior: RevenueRangeSettings;
  midmarketSenior: RevenueRangeSettings;
  enterpriseJunior: RevenueRangeSettings;
  enterpriseSenior: RevenueRangeSettings;
}

interface AccountNumberSettings {
  id?: string;
  size_type: 'midmarket' | 'enterprise';
  seniority_type: 'junior' | 'senior';
  max_accounts: number;
}

interface AccountNumberSettingsState {
  midmarketJunior: AccountNumberSettings;
  midmarketSenior: AccountNumberSettings;
  enterpriseJunior: AccountNumberSettings;
  enterpriseSenior: AccountNumberSettings;
}

export default function AdminSettingsPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [settings, setSettings] = useState<ThresholdSettings>({});
  const [revenueRangeSettings, setRevenueRangeSettings] = useState<RevenueRangeSettingsState>({
    midmarketJunior: {
      size_type: 'midmarket',
      seniority_type: 'junior',
      min_revenue: 1_000_000,
      max_revenue: 5_000_000,
    },
    midmarketSenior: {
      size_type: 'midmarket',
      seniority_type: 'senior',
      min_revenue: 2_000_000,
      max_revenue: 8_000_000,
    },
    enterpriseJunior: {
      size_type: 'enterprise',
      seniority_type: 'junior',
      min_revenue: 3_000_000,
      max_revenue: 10_000_000,
    },
    enterpriseSenior: {
      size_type: 'enterprise',
      seniority_type: 'senior',
      min_revenue: 5_000_000,
      max_revenue: 20_000_000,
    },
  });
  const [accountNumberSettings, setAccountNumberSettings] = useState<AccountNumberSettingsState>({
    midmarketJunior: {
      size_type: 'midmarket',
      seniority_type: 'junior',
      max_accounts: 3,
    },
    midmarketSenior: {
      size_type: 'midmarket',
      seniority_type: 'senior',
      max_accounts: 5,
    },
    enterpriseJunior: {
      size_type: 'enterprise',
      seniority_type: 'junior',
      max_accounts: 4,
    },
    enterpriseSenior: {
      size_type: 'enterprise',
      seniority_type: 'senior',
      max_accounts: 7,
    },
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
      // Fetch threshold settings
      const { data: thresholdData, error: thresholdError } = await supabase
        .from('threshold_settings')
        .select('*')
        .single();

      if (thresholdError && thresholdError.code !== 'PGRST116') { // PGRST116 = no rows found
        console.error('Error fetching threshold settings:', thresholdError);
      } else if (thresholdData) {
        setSettings({
          id: thresholdData.id,
        });
      }

      // Fetch revenue range settings
      const { data: revenueRangeData, error: revenueRangeError } = await supabase
        .from('revenue_range_settings')
        .select('*')
        .order('size_type, seniority_type');

      if (revenueRangeError) {
        console.error('Error fetching revenue range settings:', revenueRangeError);
      } else if (revenueRangeData) {
        const newRevenueRangeSettings: RevenueRangeSettingsState = {
          midmarketJunior: {
            size_type: 'midmarket',
            seniority_type: 'junior',
            min_revenue: 1_000_000,
            max_revenue: 5_000_000,
          },
          midmarketSenior: {
            size_type: 'midmarket',
            seniority_type: 'senior',
            min_revenue: 2_000_000,
            max_revenue: 8_000_000,
          },
          enterpriseJunior: {
            size_type: 'enterprise',
            seniority_type: 'junior',
            min_revenue: 3_000_000,
            max_revenue: 10_000_000,
          },
          enterpriseSenior: {
            size_type: 'enterprise',
            seniority_type: 'senior',
            min_revenue: 5_000_000,
            max_revenue: 20_000_000,
          },
        };

        // Update with fetched data
        revenueRangeData.forEach((item) => {
          // Skip items with invalid size_type or seniority_type
          if (item.size_type !== 'midmarket' && item.size_type !== 'enterprise') {
            return;
          }
          if (item.seniority_type !== 'junior' && item.seniority_type !== 'senior') {
            return;
          }
          
          const key = `${item.size_type}${item.seniority_type.charAt(0).toUpperCase() + item.seniority_type.slice(1)}` as keyof RevenueRangeSettingsState;
          if (newRevenueRangeSettings[key]) {
            newRevenueRangeSettings[key] = {
              id: item.id,
              size_type: item.size_type,
              seniority_type: item.seniority_type,
              min_revenue: item.min_revenue,
              max_revenue: item.max_revenue,
            };
          }
        });

        setRevenueRangeSettings(newRevenueRangeSettings);
      }

      // Fetch account number settings
      const { data: accountNumberData, error: accountNumberError } = await supabase
        .from('account_number_settings')
        .select('*')
        .order('size_type, seniority_type');

      if (accountNumberError) {
        console.error('Error fetching account number settings:', accountNumberError);
      } else if (accountNumberData) {
        const newAccountNumberSettings: AccountNumberSettingsState = {
          midmarketJunior: {
            size_type: 'midmarket',
            seniority_type: 'junior',
            max_accounts: 3,
          },
          midmarketSenior: {
            size_type: 'midmarket',
            seniority_type: 'senior',
            max_accounts: 5,
          },
          enterpriseJunior: {
            size_type: 'enterprise',
            seniority_type: 'junior',
            max_accounts: 4,
          },
          enterpriseSenior: {
            size_type: 'enterprise',
            seniority_type: 'senior',
            max_accounts: 7,
          },
        };

        // Update with fetched data
        accountNumberData.forEach((item) => {
          // Skip items with invalid size_type or seniority_type
          if (item.size_type !== 'midmarket' && item.size_type !== 'enterprise') {
            return;
          }
          if (item.seniority_type !== 'junior' && item.seniority_type !== 'senior') {
            return;
          }
          
          const key = `${item.size_type}${item.seniority_type.charAt(0).toUpperCase() + item.seniority_type.slice(1)}` as keyof AccountNumberSettingsState;
          if (newAccountNumberSettings[key]) {
            newAccountNumberSettings[key] = {
              id: item.id,
              size_type: item.size_type,
              seniority_type: item.seniority_type,
              max_accounts: item.max_accounts,
            };
          }
        });

        setAccountNumberSettings(newAccountNumberSettings);
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
      // Save threshold settings (minimal data since account_threshold is no longer used)
      const settingsData = {
        updated_at: new Date().toISOString(),
      };

      console.log('Saving threshold settings:', settingsData);
      console.log('Settings ID:', settings.id);

      // Store previous values for audit log
      const previousSettings = settings.id ? settings : null;

      let thresholdResult;
      if (settings.id) {
        // Update existing settings
        console.log('Updating existing threshold settings...');
        thresholdResult = await supabase
          .from('threshold_settings')
          .update(settingsData)
          .eq('id', settings.id)
          .select();
      } else {
        // Create new settings
        console.log('Creating new threshold settings...');
        thresholdResult = await supabase
          .from('threshold_settings')
          .insert(settingsData)
          .select();
      }

      console.log('Threshold settings result:', thresholdResult);

      if (thresholdResult.error) {
        console.error('Database error:', thresholdResult.error);
        throw new Error(`Database error: ${thresholdResult.error.message}`);
      }

      // Update local state with the returned data
      if (thresholdResult.data && thresholdResult.data.length > 0) {
        setSettings(prev => ({
          ...prev,
          id: thresholdResult.data[0].id
        }));
      }

      // Save revenue range settings
      const revenueRangeData = Object.values(revenueRangeSettings).map(setting => ({
        id: setting.id,
        size_type: setting.size_type,
        seniority_type: setting.seniority_type,
        min_revenue: setting.min_revenue,
        max_revenue: setting.max_revenue,
        updated_at: new Date().toISOString(),
      }));

      console.log('Saving revenue range settings:', revenueRangeData);

      // Upsert revenue range settings
      const revenueRangeResult = await supabase
        .from('revenue_range_settings')
        .upsert(revenueRangeData, { 
          onConflict: 'size_type,seniority_type',
          ignoreDuplicates: false 
        })
        .select();

      console.log('Revenue range settings result:', revenueRangeResult);

      if (revenueRangeResult.error) {
        console.error('Revenue range settings error:', revenueRangeResult.error);
        throw new Error(`Revenue range settings error: ${revenueRangeResult.error.message}`);
      }

      // Save account number settings
      const accountNumberData = Object.values(accountNumberSettings).map(setting => ({
        id: setting.id,
        size_type: setting.size_type,
        seniority_type: setting.seniority_type,
        max_accounts: setting.max_accounts,
        updated_at: new Date().toISOString(),
      }));

      console.log('Saving account number settings:', accountNumberData);

      // Upsert account number settings
      const accountNumberResult = await supabase
        .from('account_number_settings')
        .upsert(accountNumberData, { 
          onConflict: 'size_type,seniority_type',
          ignoreDuplicates: false 
        })
        .select();

      console.log('Account number settings result:', accountNumberResult);

      if (accountNumberResult.error) {
        console.error('Account number settings error:', accountNumberResult.error);
        throw new Error(`Account number settings error: ${accountNumberResult.error.message}`);
      }

      // Log audit events
      if (user?.id) {
        // Log threshold settings audit
        const thresholdAuditData = createAuditLogData(
          user.id,
          settings.id ? AUDIT_ACTIONS.UPDATE : AUDIT_ACTIONS.CREATE,
          AUDIT_ENTITIES.SETTINGS,
          thresholdResult.data?.[0]?.id,
          previousSettings,
          thresholdResult.data?.[0]
        );
        
        await logAuditEvent(thresholdAuditData);

        // Log revenue range settings audit
        for (const setting of revenueRangeResult.data || []) {
          const revenueRangeAuditData = createAuditLogData(
            user.id,
            setting.id ? AUDIT_ACTIONS.UPDATE : AUDIT_ACTIONS.CREATE,
            'REVENUE_RANGE_SETTINGS',
            setting.id,
            null,
            setting
          );
          
          await logAuditEvent(revenueRangeAuditData);
        }

        // Log account number settings audit
        for (const setting of accountNumberResult.data || []) {
          const accountNumberAuditData = createAuditLogData(
            user.id,
            setting.id ? AUDIT_ACTIONS.UPDATE : AUDIT_ACTIONS.CREATE,
            'ACCOUNT_NUMBER_SETTINGS',
            setting.id,
            null,
            setting
          );
          
          await logAuditEvent(accountNumberAuditData);
        }
      }

      toast({
        title: 'Settings Saved',
        description: 'All settings have been updated successfully.',
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
          <PageLoader text="Loading settings..." />
        </div>
      </div>
    );
  }

  // Show loading while checking authentication
  if (authLoading || (!user || !profile || profile.role !== 'MASTER')) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <PageLoader text="Authenticating..." />
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


        {/* Combined Settings by Size and Seniority */}
        <Card className="mt-8 bg-white/80 backdrop-blur-sm border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-3 text-lg">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Building2 className="h-5 w-5 text-orange-600" />
              </div>
              Seller Performance Settings by Size & Seniority
            </CardTitle>
            <CardDescription className="text-slate-600">
              Configure revenue ranges and account limits for different seller categories based on account size and seniority level.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Midmarket Junior */}
              <div className="space-y-4">
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
                  <h4 className="font-semibold text-blue-900 flex items-center gap-2 mb-3">
                    <Building2 className="h-4 w-4" />
                    Midmarket Junior (≤ 12 months)
                  </h4>
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="midmarket-junior-min" className="text-sm font-medium text-slate-700">
                        Minimum Revenue
                      </Label>
                      <div className="flex items-center gap-3 mt-1">
                        <Input
                          id="midmarket-junior-min"
                          type="text"
                          value={revenueRangeSettings.midmarketJunior.min_revenue.toLocaleString()}
                          onChange={(e) => {
                            const value = e.target.value.replace(/,/g, '');
                            const numValue = parseInt(value) || 0;
                            setRevenueRangeSettings(prev => ({
                              ...prev,
                              midmarketJunior: {
                                ...prev.midmarketJunior,
                                min_revenue: numValue
                              }
                            }));
                          }}
                          className="flex-1 h-10"
                          placeholder="1,000,000"
                        />
                        <Badge variant="outline" className="whitespace-nowrap px-2 py-1 bg-blue-50 text-blue-700 border-blue-200">
                          {formatCurrency(revenueRangeSettings.midmarketJunior.min_revenue)}
                        </Badge>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="midmarket-junior-max" className="text-sm font-medium text-slate-700">
                        Maximum Revenue
                      </Label>
                      <div className="flex items-center gap-3 mt-1">
                        <Input
                          id="midmarket-junior-max"
                          type="text"
                          value={revenueRangeSettings.midmarketJunior.max_revenue.toLocaleString()}
                          onChange={(e) => {
                            const value = e.target.value.replace(/,/g, '');
                            const numValue = parseInt(value) || 0;
                            setRevenueRangeSettings(prev => ({
                              ...prev,
                              midmarketJunior: {
                                ...prev.midmarketJunior,
                                max_revenue: numValue
                              }
                            }));
                          }}
                          className="flex-1 h-10"
                          placeholder="5,000,000"
                        />
                        <Badge variant="outline" className="whitespace-nowrap px-2 py-1 bg-blue-50 text-blue-700 border-blue-200">
                          {formatCurrency(revenueRangeSettings.midmarketJunior.max_revenue)}
                        </Badge>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="midmarket-junior-accounts" className="text-sm font-medium text-slate-700">
                        Maximum Accounts
                      </Label>
                      <div className="flex items-center gap-3 mt-1">
                        <Input
                          id="midmarket-junior-accounts"
                          type="number"
                          value={accountNumberSettings.midmarketJunior.max_accounts}
                          onChange={(e) => {
                            const value = parseInt(e.target.value) || 0;
                            setAccountNumberSettings(prev => ({
                              ...prev,
                              midmarketJunior: {
                                ...prev.midmarketJunior,
                                max_accounts: value
                              }
                            }));
                          }}
                          className="flex-1 h-10"
                          placeholder="3"
                        />
                        <Badge variant="outline" className="whitespace-nowrap px-2 py-1 bg-blue-50 text-blue-700 border-blue-200">
                          {accountNumberSettings.midmarketJunior.max_accounts} accounts
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Midmarket Senior */}
              <div className="space-y-4">
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-4">
                  <h4 className="font-semibold text-green-900 flex items-center gap-2 mb-3">
                    <Building2 className="h-4 w-4" />
                    Midmarket Senior ({'>'} 12 months)
                  </h4>
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="midmarket-senior-min" className="text-sm font-medium text-slate-700">
                        Minimum Revenue
                      </Label>
                      <div className="flex items-center gap-3 mt-1">
                        <Input
                          id="midmarket-senior-min"
                          type="text"
                          value={revenueRangeSettings.midmarketSenior.min_revenue.toLocaleString()}
                          onChange={(e) => {
                            const value = e.target.value.replace(/,/g, '');
                            const numValue = parseInt(value) || 0;
                            setRevenueRangeSettings(prev => ({
                              ...prev,
                              midmarketSenior: {
                                ...prev.midmarketSenior,
                                min_revenue: numValue
                              }
                            }));
                          }}
                          className="flex-1 h-10"
                          placeholder="2,000,000"
                        />
                        <Badge variant="outline" className="whitespace-nowrap px-2 py-1 bg-green-50 text-green-700 border-green-200">
                          {formatCurrency(revenueRangeSettings.midmarketSenior.min_revenue)}
                        </Badge>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="midmarket-senior-max" className="text-sm font-medium text-slate-700">
                        Maximum Revenue
                      </Label>
                      <div className="flex items-center gap-3 mt-1">
                        <Input
                          id="midmarket-senior-max"
                          type="text"
                          value={revenueRangeSettings.midmarketSenior.max_revenue.toLocaleString()}
                          onChange={(e) => {
                            const value = e.target.value.replace(/,/g, '');
                            const numValue = parseInt(value) || 0;
                            setRevenueRangeSettings(prev => ({
                              ...prev,
                              midmarketSenior: {
                                ...prev.midmarketSenior,
                                max_revenue: numValue
                              }
                            }));
                          }}
                          className="flex-1 h-10"
                          placeholder="8,000,000"
                        />
                        <Badge variant="outline" className="whitespace-nowrap px-2 py-1 bg-green-50 text-green-700 border-green-200">
                          {formatCurrency(revenueRangeSettings.midmarketSenior.max_revenue)}
                        </Badge>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="midmarket-senior-accounts" className="text-sm font-medium text-slate-700">
                        Maximum Accounts
                      </Label>
                      <div className="flex items-center gap-3 mt-1">
                        <Input
                          id="midmarket-senior-accounts"
                          type="number"
                          value={accountNumberSettings.midmarketSenior.max_accounts}
                          onChange={(e) => {
                            const value = parseInt(e.target.value) || 0;
                            setAccountNumberSettings(prev => ({
                              ...prev,
                              midmarketSenior: {
                                ...prev.midmarketSenior,
                                max_accounts: value
                              }
                            }));
                          }}
                          className="flex-1 h-10"
                          placeholder="5"
                        />
                        <Badge variant="outline" className="whitespace-nowrap px-2 py-1 bg-green-50 text-green-700 border-green-200">
                          {accountNumberSettings.midmarketSenior.max_accounts} accounts
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Enterprise Junior */}
              <div className="space-y-4">
                <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-xl p-4">
                  <h4 className="font-semibold text-orange-900 flex items-center gap-2 mb-3">
                    <Building2 className="h-4 w-4" />
                    Enterprise Junior (≤ 12 months)
                  </h4>
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="enterprise-junior-min" className="text-sm font-medium text-slate-700">
                        Minimum Revenue
                      </Label>
                      <div className="flex items-center gap-3 mt-1">
                        <Input
                          id="enterprise-junior-min"
                          type="text"
                          value={revenueRangeSettings.enterpriseJunior.min_revenue.toLocaleString()}
                          onChange={(e) => {
                            const value = e.target.value.replace(/,/g, '');
                            const numValue = parseInt(value) || 0;
                            setRevenueRangeSettings(prev => ({
                              ...prev,
                              enterpriseJunior: {
                                ...prev.enterpriseJunior,
                                min_revenue: numValue
                              }
                            }));
                          }}
                          className="flex-1 h-10"
                          placeholder="3,000,000"
                        />
                        <Badge variant="outline" className="whitespace-nowrap px-2 py-1 bg-orange-50 text-orange-700 border-orange-200">
                          {formatCurrency(revenueRangeSettings.enterpriseJunior.min_revenue)}
                        </Badge>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="enterprise-junior-max" className="text-sm font-medium text-slate-700">
                        Maximum Revenue
                      </Label>
                      <div className="flex items-center gap-3 mt-1">
                        <Input
                          id="enterprise-junior-max"
                          type="text"
                          value={revenueRangeSettings.enterpriseJunior.max_revenue.toLocaleString()}
                          onChange={(e) => {
                            const value = e.target.value.replace(/,/g, '');
                            const numValue = parseInt(value) || 0;
                            setRevenueRangeSettings(prev => ({
                              ...prev,
                              enterpriseJunior: {
                                ...prev.enterpriseJunior,
                                max_revenue: numValue
                              }
                            }));
                          }}
                          className="flex-1 h-10"
                          placeholder="10,000,000"
                        />
                        <Badge variant="outline" className="whitespace-nowrap px-2 py-1 bg-orange-50 text-orange-700 border-orange-200">
                          {formatCurrency(revenueRangeSettings.enterpriseJunior.max_revenue)}
                        </Badge>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="enterprise-junior-accounts" className="text-sm font-medium text-slate-700">
                        Maximum Accounts
                      </Label>
                      <div className="flex items-center gap-3 mt-1">
                        <Input
                          id="enterprise-junior-accounts"
                          type="number"
                          value={accountNumberSettings.enterpriseJunior.max_accounts}
                          onChange={(e) => {
                            const value = parseInt(e.target.value) || 0;
                            setAccountNumberSettings(prev => ({
                              ...prev,
                              enterpriseJunior: {
                                ...prev.enterpriseJunior,
                                max_accounts: value
                              }
                            }));
                          }}
                          className="flex-1 h-10"
                          placeholder="4"
                        />
                        <Badge variant="outline" className="whitespace-nowrap px-2 py-1 bg-orange-50 text-orange-700 border-orange-200">
                          {accountNumberSettings.enterpriseJunior.max_accounts} accounts
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Enterprise Senior */}
              <div className="space-y-4">
                <div className="bg-gradient-to-r from-purple-50 to-violet-50 border border-purple-200 rounded-xl p-4">
                  <h4 className="font-semibold text-purple-900 flex items-center gap-2 mb-3">
                    <Building2 className="h-4 w-4" />
                    Enterprise Senior ({'>'} 12 months)
                  </h4>
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="enterprise-senior-min" className="text-sm font-medium text-slate-700">
                        Minimum Revenue
                      </Label>
                      <div className="flex items-center gap-3 mt-1">
                        <Input
                          id="enterprise-senior-min"
                          type="text"
                          value={revenueRangeSettings.enterpriseSenior.min_revenue.toLocaleString()}
                          onChange={(e) => {
                            const value = e.target.value.replace(/,/g, '');
                            const numValue = parseInt(value) || 0;
                            setRevenueRangeSettings(prev => ({
                              ...prev,
                              enterpriseSenior: {
                                ...prev.enterpriseSenior,
                                min_revenue: numValue
                              }
                            }));
                          }}
                          className="flex-1 h-10"
                          placeholder="5,000,000"
                        />
                        <Badge variant="outline" className="whitespace-nowrap px-2 py-1 bg-purple-50 text-purple-700 border-purple-200">
                          {formatCurrency(revenueRangeSettings.enterpriseSenior.min_revenue)}
                        </Badge>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="enterprise-senior-max" className="text-sm font-medium text-slate-700">
                        Maximum Revenue
                      </Label>
                      <div className="flex items-center gap-3 mt-1">
                        <Input
                          id="enterprise-senior-max"
                          type="text"
                          value={revenueRangeSettings.enterpriseSenior.max_revenue.toLocaleString()}
                          onChange={(e) => {
                            const value = e.target.value.replace(/,/g, '');
                            const numValue = parseInt(value) || 0;
                            setRevenueRangeSettings(prev => ({
                              ...prev,
                              enterpriseSenior: {
                                ...prev.enterpriseSenior,
                                max_revenue: numValue
                              }
                            }));
                          }}
                          className="flex-1 h-10"
                          placeholder="20,000,000"
                        />
                        <Badge variant="outline" className="whitespace-nowrap px-2 py-1 bg-purple-50 text-purple-700 border-purple-200">
                          {formatCurrency(revenueRangeSettings.enterpriseSenior.max_revenue)}
                        </Badge>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="enterprise-senior-accounts" className="text-sm font-medium text-slate-700">
                        Maximum Accounts
                      </Label>
                      <div className="flex items-center gap-3 mt-1">
                        <Input
                          id="enterprise-senior-accounts"
                          type="number"
                          value={accountNumberSettings.enterpriseSenior.max_accounts}
                          onChange={(e) => {
                            const value = parseInt(e.target.value) || 0;
                            setAccountNumberSettings(prev => ({
                              ...prev,
                              enterpriseSenior: {
                                ...prev.enterpriseSenior,
                                max_accounts: value
                              }
                            }));
                          }}
                          className="flex-1 h-10"
                          placeholder="7"
                        />
                        <Badge variant="outline" className="whitespace-nowrap px-2 py-1 bg-purple-50 text-purple-700 border-purple-200">
                          {accountNumberSettings.enterpriseSenior.max_accounts} accounts
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-r from-slate-50 to-blue-50 border border-slate-200 rounded-xl p-4">
              <p className="text-sm text-slate-600 flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Sellers will be categorized by their account size (midmarket/enterprise) and seniority level (junior ≤ 12 months, senior {'>'} 12 months) based on their tenure_months field. Health indicators will show green for sellers within their category's ranges and red for those outside the configured thresholds.
              </p>
            </div>
          </CardContent>
        </Card>

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


          {/* Combined Settings Preview Section */}
          <Card className="mt-8 bg-white/80 backdrop-blur-sm border-slate-200 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-3 text-lg">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <Building2 className="h-5 w-5 text-orange-600" />
                </div>
                Seller Performance Settings Preview by Size & Seniority
              </CardTitle>
              <CardDescription className="text-slate-600">
                See how sellers will be categorized and their health indicators will appear based on the new combined settings.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Midmarket Examples */}
                <div className="space-y-4">
                  <h4 className="font-semibold text-blue-700 flex items-center gap-2 text-base">
                    <Building2 className="h-5 w-5" />
                    Midmarket Sellers
                  </h4>
                  
                  {/* Midmarket Junior Healthy */}
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <DollarSign className="h-5 w-5 text-blue-600" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-lg font-bold text-slate-900">
                            {formatCurrency((revenueRangeSettings.midmarketJunior.min_revenue + revenueRangeSettings.midmarketJunior.max_revenue) / 2)}
                          </p>
                          <div className="w-3 h-3 rounded-full bg-green-500" />
                        </div>
                        <p className="text-sm text-slate-600">Midmarket Junior (8 months) ✓</p>
                        <p className="text-xs text-green-600 mt-1">
                          Within range ({formatCurrency(revenueRangeSettings.midmarketJunior.min_revenue)} - {formatCurrency(revenueRangeSettings.midmarketJunior.max_revenue)})
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Midmarket Senior Healthy */}
                  <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-4 border border-green-200">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-green-100 rounded-lg">
                        <DollarSign className="h-5 w-5 text-green-600" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-lg font-bold text-slate-900">
                            {formatCurrency((revenueRangeSettings.midmarketSenior.min_revenue + revenueRangeSettings.midmarketSenior.max_revenue) / 2)}
                          </p>
                          <div className="w-3 h-3 rounded-full bg-green-500" />
                        </div>
                        <p className="text-sm text-slate-600">Midmarket Senior (18 months) ✓</p>
                        <p className="text-xs text-green-600 mt-1">
                          Within range ({formatCurrency(revenueRangeSettings.midmarketSenior.min_revenue)} - {formatCurrency(revenueRangeSettings.midmarketSenior.max_revenue)})
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Enterprise Examples */}
                <div className="space-y-4">
                  <h4 className="font-semibold text-purple-700 flex items-center gap-2 text-base">
                    <Building2 className="h-5 w-5" />
                    Enterprise Sellers
                  </h4>
                  
                  {/* Enterprise Junior Healthy */}
                  <div className="bg-gradient-to-r from-orange-50 to-amber-50 rounded-xl p-4 border border-orange-200">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-orange-100 rounded-lg">
                        <DollarSign className="h-5 w-5 text-orange-600" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-lg font-bold text-slate-900">
                            {formatCurrency((revenueRangeSettings.enterpriseJunior.min_revenue + revenueRangeSettings.enterpriseJunior.max_revenue) / 2)}
                          </p>
                          <div className="w-3 h-3 rounded-full bg-green-500" />
                        </div>
                        <p className="text-sm text-slate-600">Enterprise Junior (6 months) ✓</p>
                        <p className="text-xs text-green-600 mt-1">
                          Within range ({formatCurrency(revenueRangeSettings.enterpriseJunior.min_revenue)} - {formatCurrency(revenueRangeSettings.enterpriseJunior.max_revenue)})
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Enterprise Senior Healthy */}
                  <div className="bg-gradient-to-r from-purple-50 to-violet-50 rounded-xl p-4 border border-purple-200">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-purple-100 rounded-lg">
                        <DollarSign className="h-5 w-5 text-purple-600" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-lg font-bold text-slate-900">
                            {formatCurrency((revenueRangeSettings.enterpriseSenior.min_revenue + revenueRangeSettings.enterpriseSenior.max_revenue) / 2)}
                          </p>
                          <div className="w-3 h-3 rounded-full bg-green-500" />
                        </div>
                        <p className="text-sm text-slate-600">Enterprise Senior (24 months) ✓</p>
                        <p className="text-xs text-green-600 mt-1">
                          Within range ({formatCurrency(revenueRangeSettings.enterpriseSenior.min_revenue)} - {formatCurrency(revenueRangeSettings.enterpriseSenior.max_revenue)})
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 bg-gradient-to-r from-slate-50 to-blue-50 border border-slate-200 rounded-xl p-4">
                <p className="text-sm text-slate-600 flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  Sellers will be automatically categorized based on their account size and tenure_months field. Junior sellers (≤ 12 months) and Senior sellers ({'>'} 12 months) will have different revenue expectations.
                </p>
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
