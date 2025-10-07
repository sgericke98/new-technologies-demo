'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Save, Settings, DollarSign, Building2, AlertTriangle, CheckCircle, ArrowLeft, Home, Shield, Upload, Download, Trash2, Database } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/integrations/supabase/client';
import { logAuditEvent, createAuditLogData, AUDIT_ACTIONS, AUDIT_ENTITIES } from '@/lib/audit';
import {
  downloadComprehensiveTemplate,
  importComprehensiveData,
  importComprehensiveDataAdd,
  downloadTemplate,
  importSellersIndividual,
  importAccountsIndividual,
  validateSellersTemplate,
  validateAccountsTemplate,
  validateComprehensiveTemplate,
  readSheet,
  exportCompleteAccountsWithAssignedSellers,
} from '@/lib/importers';
import { PageLoader } from '@/components/ui/loader';

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
  const queryClient = useQueryClient();
  // Removed old threshold_settings state - now using dynamic threshold tables
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
  const [showImportConfirmation, setShowImportConfirmation] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importType, setImportType] = useState<'comprehensive' | 'sellers' | 'accounts' | 'comprehensive_add'>('comprehensive');
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{
    currentStep: string;
    totalSteps: number;
    currentStepNumber: number;
    logs: string[];
    isComplete: boolean;
    hasError: boolean;
    errorMessage?: string;
  }>({
    currentStep: '',
    totalSteps: 0,
    currentStepNumber: 0,
    logs: [],
    isComplete: false,
    hasError: false,
  });
  
  // File input refs for different import types
  const comprehensiveInputRef = useRef<HTMLInputElement>(null);
  const comprehensiveAddInputRef = useRef<HTMLInputElement>(null);
  const sellersInputRef = useRef<HTMLInputElement>(null);
  const accountsInputRef = useRef<HTMLInputElement>(null);

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

      // Refresh materialized view to recalculate health indicators with new thresholds
      try {
        await supabase.rpc('refresh_performance_views');
        console.log('Materialized view refreshed successfully');
        
        // Invalidate dashboard queries to refresh UI with new thresholds
        queryClient.invalidateQueries({ queryKey: ["unified-dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["unifiedDashboard"] });
        queryClient.invalidateQueries({ queryKey: ["unified-dashboard"], exact: false });
        console.log('Dashboard queries invalidated successfully');
      } catch (refreshError) {
        console.error('Error refreshing materialized view:', refreshError);
        // Don't fail the save operation if refresh fails
      }

      toast({
        title: 'Settings Saved',
        description: 'All settings have been updated successfully. Dashboard will refresh automatically.',
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

  // Handle file selection and show confirmation
  async function handleFileSelection(file: File | null, type: 'comprehensive' | 'sellers' | 'accounts' | 'comprehensive_add') {
    if (!file) return;
    
    // Validate template first
    addProgressLog(`Validating ${type} template...`);
    const validation = await validateTemplate(file, type);
    
    if (!validation.isValid) {
      setValidationErrors(validation.errors);
      setValidationWarnings(validation.warnings);
      setShowValidationModal(true);
      return;
    }
    
    // Show warnings if any
    if (validation.warnings.length > 0) {
      setValidationWarnings(validation.warnings);
      setValidationErrors([]);
      setShowValidationModal(true);
      return;
    }
    
    setSelectedFile(file);
    setImportType(type);
    
    // For comprehensive imports, show confirmation dialog
    if (type === 'comprehensive' || type === 'comprehensive_add') {
      setShowImportConfirmation(true);
    } else {
      // For individual imports, proceed directly
      handleIndividualImport(file, type);
    }
  }

  // Individual import handler (sellers or accounts)
  async function handleIndividualImport(file: File, type: 'sellers' | 'accounts') {
    try {
      setComprehensiveImporting(true);
      setImportResults(null);
      setShowProgressModal(true);
      resetProgress();
      
      updateProgressStep('Starting import...', 1, 4);
      addProgressLog(`Importing ${type} data from ${file.name}`);
      
      const userId = profile?.id;
      let results;
      
      updateProgressStep('Processing file...', 2, 4);
      
      if (type === 'sellers') {
        await importSellersIndividual(file, userId, addProgressLog);
        results = { sellers: { imported: 1, errors: [] } };
      } else if (type === 'accounts') {
        await importAccountsIndividual(file, userId, addProgressLog);
        results = { accounts: { imported: 1, errors: [] } };
      }
      
      updateProgressStep('Updating dashboard...', 3, 4);
      setImportResults(results);
      
      // Invalidate dashboard queries to refresh UI with new data
      try {
        queryClient.invalidateQueries({ queryKey: ["unified-dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["unifiedDashboard"] });
        queryClient.invalidateQueries({ queryKey: ["unified-dashboard"], exact: false });
        addProgressLog('Dashboard queries invalidated successfully');
      } catch (invalidateError) {
        addProgressLog(`Warning: Error invalidating dashboard queries: ${invalidateError}`);
        // Don't fail the import if invalidation fails
      }
      
      updateProgressStep('Finalizing...', 4, 4);
      setProgressComplete();
      
      toast({
        title: `${type === 'sellers' ? 'Sellers' : 'Accounts'} Import Complete`,
        description: `Successfully imported ${type} data. Dashboard will refresh automatically.`,
        variant: "default",
      });
    } catch (e: any) {
      setProgressError(e?.message ?? String(e));
      toast({
        title: `${type === 'sellers' ? 'Sellers' : 'Accounts'} Import Failed`,
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    } finally {
      setComprehensiveImporting(false);
      setSelectedFile(null);
    }
  }

  // Comprehensive import handler
  async function handleComprehensiveImport() {
    if (!selectedFile) return;
    
    try {
      setComprehensiveImporting(true);
      setImportResults(null);
      setShowImportConfirmation(false);
      setShowProgressModal(true);
      resetProgress();
      
      const userId = profile?.id;
      let results;
      
      const modeText = importType === 'comprehensive_add' ? 'Add Mode' : 'Replace Mode';
      updateProgressStep(`Starting ${modeText} import...`, 1, 7);
      addProgressLog(`Importing comprehensive data from ${selectedFile.name} (${modeText})`);
      
      updateProgressStep('Validating template...', 2, 7);
      
      // Validate template again for comprehensive imports
      const validation = await validateTemplate(selectedFile, importType);
      if (!validation.isValid) {
        setProgressError(`Template validation failed: ${validation.errors.join(', ')}`);
        toast({
          title: "Invalid Template",
          description: `The Excel file doesn't match the expected template. ${validation.errors.join(', ')}`,
          variant: "destructive",
        });
        return;
      }
      
      updateProgressStep('Processing Excel file...', 3, 7);
      
      if (importType === 'comprehensive_add') {
        results = await importComprehensiveDataAdd(selectedFile, userId, addProgressLog);
      } else {
        updateProgressStep('Deleting existing data...', 4, 7);
        results = await importComprehensiveData(selectedFile, userId, addProgressLog);
      }
      
      updateProgressStep('Importing new data...', 5, 7);
      setImportResults(results);
      
      const totalImported = Object.values(results).reduce((sum: number, result: any) => sum + result.imported, 0);
      const totalErrors = Object.values(results).reduce((sum: number, result: any) => sum + result.errors.length, 0);
      
      updateProgressStep('Refreshing dashboard...', 6, 7);
      
      // Invalidate dashboard queries to refresh UI with new data
      try {
        queryClient.invalidateQueries({ queryKey: ["unified-dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["unifiedDashboard"] });
        queryClient.invalidateQueries({ queryKey: ["unified-dashboard"], exact: false });
        addProgressLog('Dashboard queries invalidated successfully');
      } catch (invalidateError) {
        addProgressLog(`Warning: Error invalidating dashboard queries: ${invalidateError}`);
        // Don't fail the import if invalidation fails
      }
      
      updateProgressStep('Finalizing...', 7, 7);
      setProgressComplete();
      
      toast({
        title: `Comprehensive Import Complete (${modeText})`,
        description: `Imported ${totalImported} records with ${totalErrors} errors. Dashboard will refresh automatically.`,
        variant: totalErrors > 0 ? "destructive" : "default",
      });
    } catch (e: any) {
      setProgressError(e?.message ?? String(e));
      toast({
        title: "Comprehensive Import Failed",
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    } finally {
      setComprehensiveImporting(false);
      setSelectedFile(null);
    }
  }

  // Template validation function
  async function validateTemplate(file: File, type: 'sellers' | 'accounts' | 'comprehensive' | 'comprehensive_add'): Promise<{ isValid: boolean; errors: string[]; warnings: string[] }> {
    try {
      const wb = await readSheet(file);
      
      switch (type) {
        case 'sellers':
          return validateSellersTemplate(wb);
        case 'accounts':
          return validateAccountsTemplate(wb);
        case 'comprehensive':
        case 'comprehensive_add':
          return validateComprehensiveTemplate(wb);
        default:
          return { isValid: false, errors: ['Unknown import type'], warnings: [] };
      }
    } catch (error) {
      return { 
        isValid: false, 
        errors: [`Failed to read Excel file: ${error}`], 
        warnings: [] 
      };
    }
  }

  // Progress tracking functions
  function addProgressLog(message: string) {
    setImportProgress(prev => ({
      ...prev,
      logs: [...prev.logs, `${new Date().toLocaleTimeString()}: ${message}`]
    }));
  }

  function updateProgressStep(step: string, stepNumber: number, totalSteps: number) {
    setImportProgress(prev => ({
      ...prev,
      currentStep: step,
      currentStepNumber: stepNumber,
      totalSteps: totalSteps,
    }));
    addProgressLog(`Step ${stepNumber}/${totalSteps}: ${step}`);
  }

  function setProgressComplete() {
    setImportProgress(prev => ({
      ...prev,
      isComplete: true,
      currentStep: 'Import Complete',
    }));
    addProgressLog('✅ Import completed successfully');
  }

  function setProgressError(error: string) {
    setImportProgress(prev => ({
      ...prev,
      hasError: true,
      errorMessage: error,
      currentStep: 'Import Failed',
    }));
    addProgressLog(`❌ Error: ${error}`);
  }

  function resetProgress() {
    setImportProgress({
      currentStep: '',
      totalSteps: 0,
      currentStepNumber: 0,
      logs: [],
      isComplete: false,
      hasError: false,
    });
  }

  // Export handler
  const handleExportCompleteAccounts = async () => {
    if (!isMasterAdmin) {
      toast({
        title: 'Access Denied',
        description: 'You do not have permission to export data.',
        variant: 'destructive',
      });
      return;
    }

    setExporting(true);
    try {
      const result = await exportCompleteAccountsWithAssignedSellers();
      
      if (result) {
        toast({
          title: 'Export Complete',
          description: `Successfully exported ${result.exported} accounts (including those without assigned sellers).`,
        });
      } else {
        toast({
          title: 'No Data Found',
          description: 'No accounts were found to export.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error exporting accounts:', error);
      toast({
        title: 'Export Failed',
        description: `Failed to export accounts: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
    }
  };

  // Cancel import
  function cancelImport() {
    setShowImportConfirmation(false);
    setSelectedFile(null);
    if (comprehensiveInputRef.current) {
      comprehensiveInputRef.current.value = '';
    }
    if (comprehensiveAddInputRef.current) {
      comprehensiveAddInputRef.current.value = '';
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

        {/* 1. UPDATE MODE - Individual Data Import */}
        <Card className="bg-white/80 backdrop-blur-sm border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-3 text-lg">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Upload className="h-5 w-5 text-blue-600" />
              </div>
              1. UPDATE MODE - Individual Data Import
            </CardTitle>
            <CardDescription className="text-slate-600">
              Import specific data types while preserving existing relationships and mappings. Safe for incremental updates.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Sellers Import */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Building2 className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-blue-900">Sellers Import</h3>
                    <p className="text-sm text-blue-700">Update seller information and assignments</p>
                  </div>
                </div>
                
                <div className="flex gap-3 mb-4">
                  <Button
                    onClick={() => downloadTemplate('sellers')}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Download className="h-4 w-4" />
                    Download Template
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => sellersInputRef.current?.click()}
                    disabled={comprehensiveImporting}
                    className="flex items-center gap-2"
                  >
                    <Upload className="h-4 w-4" />
                    {comprehensiveImporting ? "Importing..." : "Import Sellers"}
                  </Button>
                </div>
                
                <input
                  ref={sellersInputRef}
                  type="file"
                  accept=".xlsx"
                  className="hidden"
                  onChange={(e) => handleFileSelection(e.target.files?.[0] ?? null, 'sellers')}
                />
                
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-2">Preserves existing:</p>
                  <ul className="list-disc list-inside space-y-1 text-xs">
                    <li>Account relationships</li>
                    <li>Manager assignments</li>
                    <li>Revenue data</li>
                  </ul>
                </div>
              </div>

              {/* Accounts Import */}
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <DollarSign className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-green-900">Accounts Import</h3>
                    <p className="text-sm text-green-700">Update account information and revenue data</p>
                  </div>
                </div>
                
                <div className="flex gap-3 mb-4">
                  <Button
                    onClick={() => downloadTemplate('accounts')}
                    className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white"
                  >
                    <Download className="h-4 w-4" />
                    Download Template
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => accountsInputRef.current?.click()}
                    disabled={comprehensiveImporting}
                    className="flex items-center gap-2"
                  >
                    <Upload className="h-4 w-4" />
                    {comprehensiveImporting ? "Importing..." : "Import Accounts"}
                  </Button>
                </div>
                
                <input
                  ref={accountsInputRef}
                  type="file"
                  accept=".xlsx"
                  className="hidden"
                  onChange={(e) => handleFileSelection(e.target.files?.[0] ?? null, 'accounts')}
                />
                
                <div className="text-sm text-green-800">
                  <p className="font-medium mb-2">Preserves existing:</p>
                  <ul className="list-disc list-inside space-y-1 text-xs">
                    <li>Seller relationships</li>
                    <li>Manager assignments</li>
                    <li>Performance data</li>
                  </ul>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 2. ADD MODE - Add New Records */}
        <Card className="bg-white/80 backdrop-blur-sm border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-3 text-lg">
              <div className="p-2 bg-green-100 rounded-lg">
                <Upload className="h-5 w-5 text-green-600" />
              </div>
              2. ADD MODE - Add New Records
            </CardTitle>
            <CardDescription className="text-slate-600">
              Import new data while keeping all existing records. Perfect for adding new sellers, accounts, or relationships without affecting current data.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Database className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-green-900">Add New Data</h3>
                  <p className="text-sm text-green-700">Add new records while preserving all existing data</p>
                </div>
              </div>
              
              <div className="flex gap-3 mb-4">
                <Button
                  onClick={() => downloadComprehensiveTemplate()}
                  className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white"
                >
                  <Download className="h-4 w-4" />
                  Download Template
                </Button>
                <Button
                  variant="outline"
                  onClick={() => comprehensiveAddInputRef.current?.click()}
                  disabled={comprehensiveImporting}
                  className="flex items-center gap-2"
                >
                  <Upload className="h-4 w-4" />
                  {comprehensiveImporting ? "Importing..." : "Add New Data"}
                </Button>
              </div>
              
              <input
                ref={comprehensiveAddInputRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => handleFileSelection(e.target.files?.[0] ?? null, 'comprehensive_add')}
              />
              
              <div className="text-sm text-green-800">
                <p className="font-medium mb-2">Adds new records for:</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>New sellers and managers</li>
                  <li>New accounts and revenue data</li>
                  <li>New account-seller relationships</li>
                  <li>New manager-seller assignments</li>
                </ul>
                <p className="mt-2 text-xs text-green-700">
                  <strong>Safe:</strong> All existing data is preserved
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 3. REPLACE MODE - Complete Data Replacement */}
        <Card className="bg-white/80 backdrop-blur-sm border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-3 text-lg">
              <div className="p-2 bg-red-100 rounded-lg">
                <Upload className="h-5 w-5 text-red-600" />
              </div>
              3. REPLACE MODE - Complete Data Replacement
            </CardTitle>
            <CardDescription className="text-slate-600">
              Import all data with a single Excel file containing multiple tabs. This will DELETE ALL existing data and replace it completely.
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
                onChange={(e) => handleFileSelection(e.target.files?.[0] ?? null, 'comprehensive')}
              />
              
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

        {/* 4. EXPORT MODE - Export Complete Accounts with Assigned Sellers */}
        <Card className="bg-white/80 backdrop-blur-sm border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-3 text-lg">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Download className="h-5 w-5 text-blue-600" />
              </div>
              4. EXPORT MODE - Export Complete Accounts with Assigned Sellers
            </CardTitle>
            <CardDescription className="text-slate-600">
              Export the complete accounts table with all fields plus assigned seller information. Includes ALL accounts - those with assigned sellers (all statuses) and those without assigned sellers (blank seller columns).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Database className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-blue-900">Complete Accounts Export</h3>
                  <p className="text-sm text-blue-700">Export all account fields with assigned seller details (includes ALL accounts)</p>
                </div>
              </div>
              
              <div className="flex gap-3 mb-4">
                <Button
                  onClick={handleExportCompleteAccounts}
                  disabled={exporting}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Download className="h-4 w-4" />
                  {exporting ? "Exporting..." : "Export Complete Accounts"}
                </Button>
              </div>
              
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-2">Exports the following data:</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>All account fields (name, location, industry, size, etc.)</li>
                  <li>All revenue data (ESG, GDT, GVC, MSG_US)</li>
                  <li>Assigned seller information (name, division, manager, etc.) - blank if no assigned seller</li>
                  <li>Relationship status (all statuses: must_keep, assigned, pinned, etc.) - blank if no assigned seller</li>
                </ul>
                <p className="mt-2 text-xs text-blue-700">
                  <strong>Note:</strong> Includes ALL accounts - those with assigned sellers and those without (blank seller columns)
                </p>
              </div>
            </div>
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

      {/* Import Confirmation Dialog */}
            <AlertDialog open={showImportConfirmation} onOpenChange={setShowImportConfirmation}>
              <AlertDialogContent className="max-w-2xl">
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-3 text-xl">
                    {importType === 'comprehensive_add' ? (
                      <div className="p-2 bg-green-100 rounded-lg">
                        <Database className="h-6 w-6 text-green-600" />
                      </div>
                    ) : (
                      <div className="p-2 bg-red-100 rounded-lg">
                        <Trash2 className="h-6 w-6 text-red-600" />
                      </div>
                    )}
                    {importType === 'comprehensive_add' ? 'Add New Data' : 'Data Import Warning'}
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-base mt-4">
                    {importType === 'comprehensive_add' ? (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                        <div className="flex items-start gap-3">
                          <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="font-semibold text-green-900 mb-2">
                              This import will ADD new data while preserving all existing records
                            </p>
                            <p className="text-green-800 text-sm">
                              New Excel data will be added to the database without affecting any current records. This is safe for incremental updates.
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="font-semibold text-red-900 mb-2">
                              This import will DELETE ALL existing data in the database
                            </p>
                            <p className="text-red-800 text-sm">
                              The new Excel data will completely replace all current records. This action cannot be undone.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    <div className="space-y-3">
                      <h4 className="font-semibold text-slate-900 flex items-center gap-2">
                        <Database className="h-4 w-4" />
                        {importType === 'comprehensive_add' ? 'Data that will be added:' : 'Data that will be deleted:'}
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                          <div className={`w-2 h-2 rounded-full ${importType === 'comprehensive_add' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                          <span>All accounts and revenue data</span>
                        </div>
                        <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                          <div className={`w-2 h-2 rounded-full ${importType === 'comprehensive_add' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                          <span>All sellers and assignments</span>
                        </div>
                        <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                          <div className={`w-2 h-2 rounded-full ${importType === 'comprehensive_add' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                          <span>All managers and teams</span>
                        </div>
                        <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                          <div className={`w-2 h-2 rounded-full ${importType === 'comprehensive_add' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                          <span>All account-seller relationships</span>
                        </div>
                      </div>
                      
                      {selectedFile && (
                        <div className={`mt-4 p-3 border rounded-lg ${importType === 'comprehensive_add' ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'}`}>
                          <p className={`text-sm ${importType === 'comprehensive_add' ? 'text-green-800' : 'text-blue-800'}`}>
                            <strong>Selected file:</strong> {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                          </p>
                        </div>
                      )}
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="gap-3">
                  <AlertDialogCancel 
                    onClick={cancelImport}
                    className="flex items-center gap-2"
                  >
                    Cancel Import
                  </AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={handleComprehensiveImport}
                    disabled={comprehensiveImporting}
                    className={`flex items-center gap-2 ${importType === 'comprehensive_add' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'} text-white`}
                  >
                    {comprehensiveImporting ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Importing...
                      </>
                    ) : importType === 'comprehensive_add' ? (
                      <>
                        <Database className="h-4 w-4" />
                        Yes, Add New Data
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4" />
                        Yes, Delete All Data & Import
                      </>
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

      {/* Import Progress Modal */}
      <AlertDialog open={showProgressModal} onOpenChange={setShowProgressModal}>
        <AlertDialogContent className="max-w-4xl max-h-[80vh]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-3 text-xl">
              <div className={`p-2 rounded-lg ${importProgress.hasError ? 'bg-red-100' : importProgress.isComplete ? 'bg-green-100' : 'bg-blue-100'}`}>
                {importProgress.hasError ? (
                  <AlertTriangle className="h-6 w-6 text-red-600" />
                ) : importProgress.isComplete ? (
                  <CheckCircle className="h-6 w-6 text-green-600" />
                ) : (
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                )}
              </div>
              {importProgress.hasError ? 'Import Failed' : importProgress.isComplete ? 'Import Complete' : 'Import Progress'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base mt-4">
              {importProgress.hasError ? (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                  <p className="text-red-800 font-medium">Import failed with the following error:</p>
                  <p className="text-red-700 text-sm mt-2">{importProgress.errorMessage}</p>
                </div>
              ) : importProgress.isComplete ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                  <p className="text-green-800 font-medium">Import completed successfully!</p>
                  <p className="text-green-700 text-sm mt-2">Your data has been imported and the dashboard will refresh automatically.</p>
                </div>
              ) : (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <p className="text-blue-800 font-medium">Import in progress...</p>
                  <p className="text-blue-700 text-sm mt-2">Please wait while we process your data.</p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="space-y-4">
            {/* Progress Bar */}
            {!importProgress.hasError && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{importProgress.currentStep}</span>
                  <span className="text-slate-600">
                    {importProgress.currentStepNumber}/{importProgress.totalSteps}
                  </span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full transition-all duration-300 ${
                      importProgress.hasError ? 'bg-red-500' : 
                      importProgress.isComplete ? 'bg-green-500' : 'bg-blue-500'
                    }`}
                    style={{ 
                      width: `${importProgress.totalSteps > 0 ? (importProgress.currentStepNumber / importProgress.totalSteps) * 100 : 0}%` 
                    }}
                  ></div>
                </div>
              </div>
            )}

            {/* Progress Logs */}
            <div className="space-y-2">
              <h4 className="font-semibold text-slate-900 flex items-center gap-2">
                <Database className="h-4 w-4" />
                Progress Log
              </h4>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 max-h-60 overflow-y-auto">
                <div className="space-y-1 text-sm font-mono">
                  {importProgress.logs.length === 0 ? (
                    <p className="text-slate-500 italic">Waiting for import to start...</p>
                  ) : (
                    importProgress.logs.map((log, index) => (
                      <div key={index} className="text-slate-700">
                        {log}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          <AlertDialogFooter className="gap-3">
            {importProgress.isComplete || importProgress.hasError ? (
              <AlertDialogAction 
                onClick={() => setShowProgressModal(false)}
                className="flex items-center gap-2"
              >
                <CheckCircle className="h-4 w-4" />
                Close
              </AlertDialogAction>
            ) : (
              <AlertDialogCancel 
                onClick={() => setShowProgressModal(false)}
                className="flex items-center gap-2"
              >
                Cancel Import
              </AlertDialogCancel>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Template Validation Modal */}
      <AlertDialog open={showValidationModal} onOpenChange={setShowValidationModal}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-3 text-xl">
              <div className={`p-2 rounded-lg ${validationErrors.length > 0 ? 'bg-red-100' : 'bg-yellow-100'}`}>
                {validationErrors.length > 0 ? (
                  <AlertTriangle className="h-6 w-6 text-red-600" />
                ) : (
                  <AlertTriangle className="h-6 w-6 text-yellow-600" />
                )}
              </div>
              {validationErrors.length > 0 ? 'Template Validation Failed' : 'Template Warnings'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base mt-4">
              {validationErrors.length > 0 ? (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                  <p className="text-red-800 font-medium">The Excel file doesn't match the expected template:</p>
                </div>
              ) : (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                  <p className="text-yellow-800 font-medium">The Excel file has some warnings but can still be processed:</p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="space-y-4">
            {/* Validation Errors */}
            {validationErrors.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold text-red-900 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Validation Errors
                </h4>
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <ul className="space-y-2 text-sm text-red-800">
                    {validationErrors.map((error, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <span className="text-red-600 mt-0.5">•</span>
                        <span>{error}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Validation Warnings */}
            {validationWarnings.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold text-yellow-900 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Warnings
                </h4>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <ul className="space-y-2 text-sm text-yellow-800">
                    {validationWarnings.map((warning, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <span className="text-yellow-600 mt-0.5">•</span>
                        <span>{warning}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Instructions */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-semibold text-blue-900 mb-2">What to do next:</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Download the correct template using the "Download Template" button</li>
                <li>• Fill in your data using the template format</li>
                <li>• Make sure all required columns are present</li>
                <li>• Try uploading again</li>
              </ul>
            </div>
          </div>

          <AlertDialogFooter className="gap-3">
            <AlertDialogCancel 
              onClick={() => setShowValidationModal(false)}
              className="flex items-center gap-2"
            >
              Cancel
            </AlertDialogCancel>
            {validationErrors.length === 0 && validationWarnings.length > 0 && (
              <AlertDialogAction 
                onClick={() => {
                  setShowValidationModal(false);
                  // Proceed with import despite warnings
                  if (selectedFile) {
                    setSelectedFile(selectedFile);
                    setImportType(importType);
                    if (importType === 'comprehensive' || importType === 'comprehensive_add') {
                      setShowImportConfirmation(true);
                    } else {
                      handleIndividualImport(selectedFile, importType);
                    }
                  }
                }}
                className="flex items-center gap-2 bg-yellow-600 hover:bg-yellow-700 text-white"
              >
                <AlertTriangle className="h-4 w-4" />
                Proceed Anyway
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
