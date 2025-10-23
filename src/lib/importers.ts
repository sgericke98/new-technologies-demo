import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { logAuditEvent, createAuditLogData, AUDIT_ACTIONS, AUDIT_ENTITIES } from "@/lib/audit";

// ========== Progress Callback Interface ==========
export interface ImportProgressCallback {
  (message: string): void;
}

// ========== Performance Debugging Interface ==========
export interface PerformanceMetrics {
  step: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  recordsProcessed?: number;
  batchSize?: number;
  connectionPoolStatus?: string;
  memoryUsage?: number;
  errors?: string[];
}

export interface ImportDebugInfo {
  totalStartTime: number;
  totalEndTime?: number;
  totalDuration?: number;
  steps: PerformanceMetrics[];
  connectionPoolHistory: Array<{ timestamp: number; status: string }>;
  memoryHistory: Array<{ timestamp: number; usage: number }>;
  errorHistory: Array<{ timestamp: number; error: string; step: string }>;
}

// Global debug info for the current import
let currentDebugInfo: ImportDebugInfo | null = null;

// ========== Debugging Utilities ==========
function createDebugInfo(): ImportDebugInfo {
  return {
    totalStartTime: Date.now(),
    steps: [],
    connectionPoolHistory: [],
    memoryHistory: [],
    errorHistory: []
  };
}

function startStep(step: string, batchSize?: number): PerformanceMetrics {
  const metrics: PerformanceMetrics = {
    step,
    startTime: Date.now(),
    batchSize
  };
  
  if (currentDebugInfo) {
    currentDebugInfo.steps.push(metrics);
  }
  
  return metrics;
}

function endStep(metrics: PerformanceMetrics, recordsProcessed?: number, errors?: string[]) {
  metrics.endTime = Date.now();
  metrics.duration = metrics.endTime - metrics.startTime;
  metrics.recordsProcessed = recordsProcessed;
  metrics.errors = errors;
  
  // Log memory usage
  if (typeof window !== 'undefined' && (window as any).performance?.memory) {
    metrics.memoryUsage = (window as any).performance.memory.usedJSHeapSize;
  }
  
  // Log to console for debugging
  console.log(`🔍 DEBUG: ${metrics.step} completed in ${metrics.duration}ms`, {
    recordsProcessed,
    batchSize: metrics.batchSize,
    duration: metrics.duration,
    errors: errors?.length || 0,
    memoryUsage: metrics.memoryUsage
  });
}

function logConnectionPoolStatus(status: string) {
  if (currentDebugInfo) {
    currentDebugInfo.connectionPoolHistory.push({
      timestamp: Date.now(),
      status
    });
  }
}

function logMemoryUsage() {
  if (currentDebugInfo && typeof window !== 'undefined' && (window as any).performance?.memory) {
    currentDebugInfo.memoryHistory.push({
      timestamp: Date.now(),
      usage: (window as any).performance.memory.usedJSHeapSize
    });
  }
}

function logError(error: string, step: string) {
  if (currentDebugInfo) {
    currentDebugInfo.errorHistory.push({
      timestamp: Date.now(),
      error,
      step
    });
  }
}

function finalizeDebugInfo(): ImportDebugInfo | null {
  if (currentDebugInfo) {
    currentDebugInfo.totalEndTime = Date.now();
    currentDebugInfo.totalDuration = currentDebugInfo.totalEndTime - currentDebugInfo.totalStartTime;
    
    // Log comprehensive debug summary
    console.log('🔍 COMPREHENSIVE DEBUG SUMMARY:', {
      totalDuration: currentDebugInfo.totalDuration,
      steps: currentDebugInfo.steps.map(s => ({
        step: s.step,
        duration: s.duration,
        recordsProcessed: s.recordsProcessed,
        batchSize: s.batchSize,
        errors: s.errors?.length || 0
      })),
      connectionPoolEvents: currentDebugInfo.connectionPoolHistory.length,
      memoryEvents: currentDebugInfo.memoryHistory.length,
      errorEvents: currentDebugInfo.errorHistory.length
    });
    
    const debugInfo = currentDebugInfo;
    currentDebugInfo = null;
    return debugInfo;
  }
  return null;
}

// Export function to get current debug info
export function getCurrentDebugInfo(): ImportDebugInfo | null {
  return currentDebugInfo;
}

// ========== Template Validation ==========
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// Validate individual sellers template
export function validateSellersTemplate(wb: XLSX.WorkBook): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (!wb.SheetNames.includes("Sellers")) {
    errors.push("Missing 'Sellers' sheet");
    return { isValid: false, errors, warnings };
  }
  
  const ws = wb.Sheets["Sellers"];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
  
  if (data.length < 2) {
    errors.push("Sellers sheet must have at least a header row and one data row");
    return { isValid: false, errors, warnings };
  }
  
  const headers = data[0] as string[];
  const requiredColumns = ["seller_name", "division", "size"];
  const missingColumns = requiredColumns.filter(col => !headers.includes(col));
  
  if (missingColumns.length > 0) {
    errors.push(`Missing required columns: ${missingColumns.join(", ")}`);
  }
  
  // Check for unexpected columns
  const expectedColumns = ["seller_name", "division", "size", "industry_specialty", "state", "city", "country", "hire_date", "seniority_type"];
  const unexpectedColumns = headers.filter(h => !expectedColumns.includes(h));
  
  if (unexpectedColumns.length > 0) {
    warnings.push(`Unexpected columns found: ${unexpectedColumns.join(", ")}`);
  }
  
  // Validate country and state codes and check for discrepancies
  const availableCountryCodes = getAvailableCountryCodes();
  const availableStateCodes = getAvailableStateCodes();
  const locationDiscrepancies: string[] = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i] as any[];
    const rowNum = i + 1;
    
    if (row[headers.indexOf("country")]) {
      const country = row[headers.indexOf("country")].toString().trim();
      if (country && country !== "N/A" && country !== "No data" && !availableCountryCodes.includes(country)) {
        locationDiscrepancies.push(`Row ${rowNum}: Country '${country}' not found in mapping`);
      }
    }
    
    if (row[headers.indexOf("state")]) {
      const state = row[headers.indexOf("state")].toString().trim();
      const stateUpper = state.toUpperCase();
      if (state && state !== "N/A" && state !== "No data" && stateUpper !== "WI" && state !== "Distributed" && !availableStateCodes.includes(stateUpper)) {
        locationDiscrepancies.push(`Row ${rowNum}: State '${state}' not found in mapping`);
      }
    }
  }
  
  if (locationDiscrepancies.length > 0) {
    warnings.push(...locationDiscrepancies);
  }
  
  return { isValid: errors.length === 0, errors, warnings };
}

// Validate individual accounts template
export function validateAccountsTemplate(wb: XLSX.WorkBook): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (!wb.SheetNames.includes("Accounts")) {
    errors.push("Missing 'Accounts' sheet");
    return { isValid: false, errors, warnings };
  }
  
  const ws = wb.Sheets["Accounts"];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
  
  if (data.length < 2) {
    errors.push("Accounts sheet must have at least a header row and one data row");
    return { isValid: false, errors, warnings };
  }
  
  const headers = data[0] as string[];
  const requiredColumns = ["account_name", "size", "current_division"];
  const missingColumns = requiredColumns.filter(col => !headers.includes(col));
  
  if (missingColumns.length > 0) {
    errors.push(`Missing required columns: ${missingColumns.join(", ")}`);
  }
  
  // Check for unexpected columns
  const expectedColumns = ["account_name", "industry", "size", "tier", "type", "state", "city", "country", "current_division", "revenue_ESG", "revenue_GDT", "revenue_GVC", "revenue_MSG_US"];
  const unexpectedColumns = headers.filter(h => !expectedColumns.includes(h));
  
  if (unexpectedColumns.length > 0) {
    warnings.push(`Unexpected columns found: ${unexpectedColumns.join(", ")}`);
  }
  
  // Validate country and state codes and check for discrepancies
  const availableCountryCodes = getAvailableCountryCodes();
  const availableStateCodes = getAvailableStateCodes();
  const locationDiscrepancies: string[] = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i] as any[];
    const rowNum = i + 1;
    
    if (row[headers.indexOf("country")]) {
      const country = row[headers.indexOf("country")].toString().trim();
      if (country && country !== "N/A" && country !== "No data" && !availableCountryCodes.includes(country)) {
        locationDiscrepancies.push(`Row ${rowNum}: Country '${country}' not found in mapping`);
      }
    }
    
    if (row[headers.indexOf("state")]) {
      const state = row[headers.indexOf("state")].toString().trim();
      const stateUpper = state.toUpperCase();
      if (state && state !== "N/A" && state !== "No data" && stateUpper !== "WI" && state !== "Distributed" && !availableStateCodes.includes(stateUpper)) {
        locationDiscrepancies.push(`Row ${rowNum}: State '${state}' not found in mapping`);
      }
    }
  }
  
  if (locationDiscrepancies.length > 0) {
    warnings.push(...locationDiscrepancies);
  }
  
  return { isValid: errors.length === 0, errors, warnings };
}

// Validate comprehensive template
export function validateComprehensiveTemplate(wb: XLSX.WorkBook, mode: 'comprehensive' | 'comprehensive_add' = 'comprehensive'): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  const requiredSheets = ["Accounts", "Sellers", "Managers", "Relationship_Map", "Manager_Team"];
  const missingSheets = requiredSheets.filter(sheet => !wb.SheetNames.includes(sheet));
  
  if (missingSheets.length > 0) {
    errors.push(`Missing required sheets: ${missingSheets.join(", ")}`);
  }
  
  // Get available country codes for validation
  const availableCountryCodes = getAvailableCountryCodes();
  
  // Validate each sheet if it exists
  for (const sheetName of requiredSheets) {
    if (wb.SheetNames.includes(sheetName)) {
      const ws = wb.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
      
      // For ADD mode, Managers sheet can have only header row (no data rows) 
      // since managers might already exist in the database
      if (data.length < 2) {
        if (mode === 'comprehensive_add' && sheetName === 'Managers') {
          warnings.push(`${sheetName} sheet has only header row - this is allowed in ADD mode if managers already exist in the database`);
        } else {
          errors.push(`${sheetName} sheet must have at least a header row and one data row`);
        }
        continue;
      }
      
      const headers = data[0] as string[];
      
      // Define required columns for each sheet
      let requiredColumns: string[] = [];
      switch (sheetName) {
        case "Accounts":
          requiredColumns = ["account_name", "size", "current_division"];
          break;
        case "Sellers":
          requiredColumns = ["seller_name", "division", "size"];
          break;
        case "Managers":
          requiredColumns = ["manager_name", "manager_email"];
          break;
        case "Relationship_Map":
          requiredColumns = ["account_name", "seller_name"];
          break;
        case "Manager_Team":
          requiredColumns = ["manager_name", "seller_name"];
          // is_primary is optional - defaults to true if not provided
          break;
      }
      
      const missingColumns = requiredColumns.filter(col => !headers.includes(col));
      if (missingColumns.length > 0) {
        errors.push(`${sheetName} sheet missing required columns: ${missingColumns.join(", ")}`);
      }
      
      // Check for country and state discrepancies in Accounts and Sellers sheets
      if ((sheetName === "Accounts" || sheetName === "Sellers") && (headers.includes("country") || headers.includes("state"))) {
        const availableStateCodes = getAvailableStateCodes();
        const locationDiscrepancies: string[] = [];
        
        for (let i = 1; i < data.length; i++) {
          const row = data[i] as any[];
          const rowNum = i + 1;
          
          if (row[headers.indexOf("country")]) {
            const country = row[headers.indexOf("country")].toString().trim();
            if (country && country !== "N/A" && country !== "No data" && !availableCountryCodes.includes(country)) {
              locationDiscrepancies.push(`${sheetName} Row ${rowNum}: Country '${country}' not found in mapping`);
            }
          }
          
          if (row[headers.indexOf("state")]) {
            const state = row[headers.indexOf("state")].toString().trim();
            const stateUpper = state.toUpperCase();
            if (state && state !== "N/A" && state !== "No data" && stateUpper !== "WI" && state !== "Distributed" && !availableStateCodes.includes(stateUpper)) {
              locationDiscrepancies.push(`${sheetName} Row ${rowNum}: State '${state}' not found in mapping`);
            }
          }
        }
        
        if (locationDiscrepancies.length > 0) {
          warnings.push(...locationDiscrepancies);
        }
      }
    }
  }
  
  return { isValid: errors.length === 0, errors, warnings };
}

// Helpers
export function readSheet(file: File) {
  return new Promise<XLSX.WorkBook>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const wb = XLSX.read(reader.result, { type: "binary" });
        resolve(wb);
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = reject;
    reader.readAsBinaryString(file);
  });
}

function sheetToJson<T = any>(wb: XLSX.WorkBook, name?: string): T[] {
  const sheetName = name ?? wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  return XLSX.utils.sheet_to_json<T>(ws, { defval: null, raw: true });
}

// ========== Accounts.xlsx ==========
type AccountRow = {
  account_name: string;
  industry: string | null;
  size: "enterprise" | "midmarket";
  tier: string | null;
  type: string | null;
  state: string | null;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  current_division: "ESG" | "GDT" | "GVC" | "MSG US";
  revenue_ESG: number | null;
  revenue_GDT: number | null;
  revenue_GVC: number | null;
  revenue_MSG_US: number | null;
};

const BATCH_SIZE = 500;
const RELATIONSHIP_BATCH_SIZE = 100; // Smaller batch size for relationship imports to avoid gateway timeouts

function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export async function importAccounts(file: File, userId?: string) {
  const wb = await readSheet(file);
  const rows = sheetToJson<AccountRow>(wb);

  if (rows.length === 0) throw new Error("Accounts.xlsx is empty");

  const required = ["account_name", "size", "current_division"];
  for (const r of required) {
    if (!(rows[0] as any)?.[r]) {
      throw new Error(`Accounts.xlsx missing required column: ${r}`);
    }
  }

  const divisionMap: Record<string, string> = {
    "ESG": "ESG",
    "GDT": "GDT",
    "GVC": "GVC",
    "MSG US": "MSG_US",
    "MSG_US": "MSG_US", // Support both formats
    "Mixed": "MIXED", // Now support MIXED as a valid division
  };

  // Size mapping to handle case variations and invalid values
  const sizeMap: Record<string, string> = {
    "enterprise": "enterprise",
    "Enterprise": "enterprise",
    "ENTERPRISE": "enterprise",
    "midmarket": "midmarket", 
    "Midmarket": "midmarket",
    "MIDMARKET": "midmarket",
    "no_data": "no_data",
    "No data": "no_data",
    "No Data": "no_data",
    "NO_DATA": "no_data",
    "-": "no_data",
    "": "no_data",
    "N/A": "no_data",
    "Unknown": "no_data",
  };

  // Prepare account data
  const accountsToUpsert = rows
    .filter(r => r.account_name)
    .map(r => {
      const normalizedDivision = divisionMap[r.current_division];
      if (!normalizedDivision) {
        throw new Error(`Invalid division: ${r.current_division}`);
      }
      
      const normalizedSize = sizeMap[r.size];
      if (!normalizedSize) {
        throw new Error(`Invalid size: ${r.size}. Must be 'enterprise' or 'midmarket'`);
      }
      
      // Get lat/lng from country or state mapping if not provided
      let lat = r.latitude;
      let lng = r.longitude;
      
      if (!lat || !lng) {
        // Try state mapping first (more specific) - skip if "N/A", "No data", "Wi"/"WI", or "Distributed"
        if (r.state && r.state !== "N/A" && r.state !== "No data" && r.state.toUpperCase() !== "WI" && r.state !== "Distributed") {
          const stateCoords = getStateCoordinates(r.state.toUpperCase());
          if (stateCoords) {
            lat = lat || stateCoords.latitude;
            lng = lng || stateCoords.longitude;
          }
        }
        
        // Fall back to country mapping if state not found - skip if "N/A" or "No data"
        if (r.country && r.country !== "N/A" && r.country !== "No data" && (!lat || !lng)) {
          const countryCoords = getCountryCoordinates(r.country);
          if (countryCoords) {
            lat = lat || countryCoords.latitude;
            lng = lng || countryCoords.longitude;
          }
        }
      }
      
      return {
        name: r.account_name,
        industry: r.industry,
        size: normalizedSize as any,
        tier: r.tier,
        type: r.type,
        state: r.state,
        city: r.city,
        country: r.country,
        lat: lat,
        lng: lng,
        current_division: normalizedDivision as any,
      };
    });

  // Remove duplicates based on name (keep first occurrence)
  const uniqueAccounts = accountsToUpsert.filter((account, index, self) => 
    index === self.findIndex(a => a.name === account.name)
  );

  
  if (accountsToUpsert.length !== uniqueAccounts.length) {
  }


  // Batch upsert accounts
  const accountChunks = chunk(uniqueAccounts, BATCH_SIZE);
  const allAccounts: Array<{ id: string; name: string }> = [];

  for (let i = 0; i < accountChunks.length; i++) {
    const { data, error } = await supabase
      .from("accounts")
      .upsert(accountChunks[i], { onConflict: "name" })
      .select("id,name");

    if (error) throw new Error(`Failed to upsert accounts batch ${i + 1}: ${error.message}`);
    if (data) allAccounts.push(...data);
  }

  // Build name->id map
  const accountMap = new Map(allAccounts.map(a => [a.name, a.id]));

  // Prepare revenue data (use original rows to get all revenue data)
  const revenuesToUpsert = rows
    .filter(r => r.account_name && accountMap.has(r.account_name))
    .map(r => ({
      account_id: accountMap.get(r.account_name)!,
      revenue_esg: r.revenue_ESG ?? 0,
      revenue_gdt: r.revenue_GDT ?? 0,
      revenue_gvc: r.revenue_GVC ?? 0,
      revenue_msg_us: r.revenue_MSG_US ?? 0,
    }));

  // Remove duplicate revenues (keep first occurrence per account)
  const uniqueRevenues = revenuesToUpsert.filter((revenue, index, self) => 
    index === self.findIndex(r => r.account_id === revenue.account_id)
  );

  
  if (revenuesToUpsert.length !== uniqueRevenues.length) {
  }


  // Batch upsert revenues
  const revenueChunks = chunk(uniqueRevenues, BATCH_SIZE);

  for (let i = 0; i < revenueChunks.length; i++) {
    const { error } = await supabase
      .from("account_revenues")
      .upsert(revenueChunks[i], { onConflict: "account_id" });

    if (error) throw new Error(`Failed to upsert revenues batch ${i + 1}: ${error.message}`);
  }


  // Refresh materialized views to update dashboard data
  try {
    await supabase.rpc('smart_refresh_performance_views');
  } catch (refreshError) {
    // Don't fail the import if refresh fails
  }

  // Log audit event
  if (userId) {
    const auditData = createAuditLogData(
      userId,
      'data_import',
      AUDIT_ENTITIES.ACCOUNT,
      undefined,
      null,
      {
        import_type: 'accounts',
        records_count: uniqueAccounts.length,
        file_name: file.name,
        file_size: file.size,
        revenue_records_count: uniqueRevenues.length,
      }
    );
    
    await logAuditEvent(auditData);
    
    // Refresh materialized views to update dashboard data
    try {
      await supabase.rpc('smart_refresh_performance_views');
    } catch (refreshError) {
      // Don't fail the import if refresh fails
    }
  }
}

// ========== Sellers.xlsx ==========
type SellerRow = {
  seller_name: string;
  division: "ESG" | "GDT" | "GVC" | "MSG US";
  size: "enterprise" | "midmarket";
  industry_specialty: string | null;
  state: string | null;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  hire_date?: string | null;
  seniority_type?: "junior" | "senior" | null;
  book_finalized?: boolean | null;
};

export async function importSellers(file: File, userId?: string) {
  const wb = await readSheet(file);
  const rows = sheetToJson<SellerRow>(wb);

  if (rows.length === 0) throw new Error("Sellers.xlsx is empty");

  const required = ["seller_name", "division", "size"];
  for (const r of required) {
    if (!(rows[0] as any)?.[r]) {
      throw new Error(`Sellers.xlsx missing required column: ${r}`);
    }
  }

  const divisionMap: Record<string, string> = {
    "ESG": "ESG",
    "GDT": "GDT",
    "GVC": "GVC",
    "MSG US": "MSG_US",
    "MSG_US": "MSG_US",
    "Mixed": "MIXED", // Now support MIXED as a valid division
  };

  // Size mapping to handle case variations and invalid values
  const sizeMap: Record<string, string> = {
    "enterprise": "enterprise",
    "Enterprise": "enterprise",
    "ENTERPRISE": "enterprise",
    "midmarket": "midmarket", 
    "Midmarket": "midmarket",
    "MIDMARKET": "midmarket",
    "no_data": "no_data",
    "No data": "no_data",
    "No Data": "no_data",
    "NO_DATA": "no_data",
    // Handle invalid/missing values - default to midmarket
    "-": "midmarket",
    "": "midmarket",
    "N/A": "midmarket",
    "Unknown": "midmarket",
  };

  // Prepare seller data
  const sellersToUpsert = rows
    .filter(r => r.seller_name)
    .map(r => {
      const normalizedDivision = divisionMap[r.division];
      if (!normalizedDivision) {
        throw new Error(`Invalid division: ${r.division}`);
      }

      const normalizedSize = sizeMap[r.size];
      if (!normalizedSize) {
        throw new Error(`Invalid size: ${r.size}. Must be 'enterprise' or 'midmarket'`);
      }

      // Get lat/lng from country or state mapping if not provided
      let lat = r.latitude;
      let lng = r.longitude;
      
      if (!lat || !lng) {
        // Try state mapping first (more specific) - skip if "N/A", "No data", "Wi"/"WI", or "Distributed"
        if (r.state && r.state !== "N/A" && r.state !== "No data" && r.state.toUpperCase() !== "WI" && r.state !== "Distributed") {
          const stateCoords = getStateCoordinates(r.state.toUpperCase());
          if (stateCoords) {
            lat = lat || stateCoords.latitude;
            lng = lng || stateCoords.longitude;
          }
        }
        
        // Fall back to country mapping if state not found - skip if "N/A" or "No data"
        if (r.country && r.country !== "N/A" && r.country !== "No data" && (!lat || !lng)) {
          const countryCoords = getCountryCoordinates(r.country);
          if (countryCoords) {
            lat = lat || countryCoords.latitude;
            lng = lng || countryCoords.longitude;
          }
        }
      }

      return {
        name: r.seller_name,
        division: normalizedDivision as any,
        size: normalizedSize as any,
        industry_specialty: r.industry_specialty,
        state: r.state,
        city: r.city,
        country: r.country,
        lat: lat,
        lng: lng,
        tenure_months: r.hire_date ? calculateTenureMonths(r.hire_date) : null,
        seniority_type: r.seniority_type || null,
        manager_id: null, // Will be assigned via Manager_Team tab
        book_finalized: r.book_finalized || false, // Preserve book_finalized status
      };
    });


  // Batch upsert sellers
  const sellerChunks = chunk(sellersToUpsert, BATCH_SIZE);

  for (let i = 0; i < sellerChunks.length; i++) {
    const { error } = await supabase
      .from("sellers")
      .upsert(sellerChunks[i], { onConflict: "name" });

    if (error) throw new Error(`Failed to upsert sellers batch ${i + 1}: ${error.message}`);
  }


  // Refresh materialized views to update dashboard data
  try {
    await supabase.rpc('smart_refresh_performance_views');
  } catch (refreshError) {
    // Don't fail the import if refresh fails
  }

  // Log audit event
  if (userId) {
    const auditData = createAuditLogData(
      userId,
      'data_import',
      AUDIT_ENTITIES.SELLER,
      undefined,
      null,
      {
        import_type: 'sellers',
        records_count: sellersToUpsert.length,
        file_name: file.name,
        file_size: file.size,
      }
    );
    
    await logAuditEvent(auditData);
    
    // Refresh materialized views to update dashboard data
    try {
      await supabase.rpc('smart_refresh_performance_views');
    } catch (refreshError) {
      // Don't fail the import if refresh fails
    }
  }
}

// ========== RelationshipMap.xlsx ==========
type RelRow = {
  account_name: string;
  seller_name: string;
  status: "original" | "must keep" | "for discussion" | "to be peeled";
};

// Status map for relationship_maps table (original is handled separately)
const statusMap: Record<string, string> = {
  // Primary statuses (user-friendly names with spaces)
  "must keep": "must_keep",
  "for discussion": "for_discussion",
  "to be peeled": "to_be_peeled",
  
  // Database enum values (underscore format)
  "must_keep": "must_keep",
  "for_discussion": "for_discussion",
  "to_be_peeled": "to_be_peeled",
};

export async function importRelationshipMap(file: File, userId?: string) {
  const wb = await readSheet(file);
  const rows = sheetToJson<RelRow>(wb);

  if (rows.length === 0) throw new Error("RelationshipMap.xlsx is empty");

  const required = ["account_name", "seller_name", "status"];
  for (const r of required) {
    if (!(rows[0] as any)?.[r]) {
      throw new Error(`RelationshipMap.xlsx missing required column: ${r}`);
    }
  }

  // Prefetch accounts, sellers, and profiles

  // Fetch all accounts with pagination to get all 7714+ records
  let allAccounts: any[] = [];
  let from = 0;
  const limit = 1000;
  let hasMore = true;
  
  while (hasMore) {
    const { data, error } = await supabase
      .from("accounts")
      .select("id,name")
      .range(from, from + limit - 1);
    
    if (error) throw new Error(`Failed to fetch accounts: ${error.message}`);
    
    if (data && data.length > 0) {
      allAccounts = allAccounts.concat(data);
      from += limit;
    } else {
      hasMore = false;
    }
    
    // Safety check to prevent infinite loop
    if (from > 10000) {
      break;
    }
  }
  
  
  const [sellersRes, profilesRes] = await Promise.all([
    supabase.from("sellers").select("id,name"),
    supabase.from("profiles").select("id,email"),
  ]);

  if (sellersRes.error) throw new Error(`Failed to fetch sellers: ${sellersRes.error.message}`);
  if (profilesRes.error) throw new Error(`Failed to fetch profiles: ${profilesRes.error.message}`);

  
  // Debug: Check if Cannon account is in the raw data
  const cannonInRawData = allAccounts.find(a => a.name === "Cannon Instrument Company");
  if (cannonInRawData) {
  }

  const accountMap = new Map(allAccounts.map(a => [a.name, a.id]));
  const sellerMap = new Map(sellersRes.data?.map(s => [s.name, s.id]) ?? []);
  const profileMap = new Map(profilesRes.data?.map(p => [p.email.toLowerCase(), p.id]) ?? []);

  
  // Debug: Check if specific account exists
  const cannonAccount = accountMap.get("Cannon Instrument Company");
  if (cannonAccount) {
  }

  // Prepare relationship data - separate original from active relationships
  const allRelationships = rows
    .filter(r => r.account_name && r.seller_name)
    .map(r => {
      // Try exact match first
      let accountId = accountMap.get(r.account_name);
      let sellerId = sellerMap.get(r.seller_name);
      
      // If not found, try case-insensitive match
      if (!accountId) {
        const exactAccount = Array.from(accountMap.keys()).find(name => 
          name.toLowerCase() === r.account_name.toLowerCase()
        );
        if (exactAccount) {
          accountId = accountMap.get(exactAccount);
        }
      }
      
      if (!sellerId) {
        const exactSeller = Array.from(sellerMap.keys()).find(name => 
          name.toLowerCase() === r.seller_name.toLowerCase()
        );
        if (exactSeller) {
          sellerId = sellerMap.get(exactSeller);
        }
      }

      if (!accountId || !sellerId) {
        
        // Show similar names for debugging
        if (!accountId) {
          const similarAccounts = Array.from(accountMap.keys()).filter(name => 
            name.toLowerCase().includes(r.account_name.toLowerCase()) || 
            r.account_name.toLowerCase().includes(name.toLowerCase())
          );
          if (similarAccounts.length > 0) {
          }
          
          // Check for exact match with different case
          const exactMatch = Array.from(accountMap.keys()).find(name => 
            name.toLowerCase() === r.account_name.toLowerCase()
          );
          if (exactMatch) {
          }
          
          // Check for extra spaces or characters
          const trimmedMatch = Array.from(accountMap.keys()).find(name => 
            name.trim().toLowerCase() === r.account_name.trim().toLowerCase()
          );
          if (trimmedMatch) {
          }
        }
        
        if (!sellerId) {
          const similarSellers = Array.from(sellerMap.keys()).filter(name => 
            name.toLowerCase().includes(r.seller_name.toLowerCase()) || 
            r.seller_name.toLowerCase().includes(name.toLowerCase())
          );
          if (similarSellers.length > 0) {
          }
        }
        
        return null;
      }

      const isOriginal = r.status.toLowerCase() === "original";
      
      // Validate status for non-original relationships
      if (!isOriginal) {
        const mappedStatus = statusMap[r.status];
        if (!mappedStatus) {
          throw new Error(`Invalid status: ${r.status}. Valid options are: original, must_keep, for_discussion, to_be_peeled`);
        }
      }

      return {
        account_id: accountId,
        seller_id: sellerId,
        status: isOriginal ? null : statusMap[r.status] as any,
        is_original: isOriginal,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  // Split into two groups: original and active relationships
  const originalRelationships = allRelationships.filter(r => r.is_original);
  const relationshipsToUpsert = allRelationships.filter(r => !r.is_original && r.status);
  
  // Debug: Log the actual counts
  console.log(`🔍 DEBUG: Total relationships processed: ${allRelationships.length}`);
  console.log(`🔍 DEBUG: Original relationships: ${originalRelationships.length}`);
  console.log(`🔍 DEBUG: Active relationships: ${relationshipsToUpsert.length}`);

  // Batch upsert active relationships (those with status, NOT marked as original)
  if (relationshipsToUpsert.length > 0) {
    const relationshipChunks = chunk(
      relationshipsToUpsert.map(({ account_id, seller_id, status }) => ({
        account_id,
        seller_id,
        status
      })),
      RELATIONSHIP_BATCH_SIZE
    );

    for (let i = 0; i < relationshipChunks.length; i++) {
      console.log(`🔍 Processing relationship_maps batch ${i + 1}/${relationshipChunks.length} (${relationshipChunks[i].length} records)`);
      
      const { error } = await supabase
        .from("relationship_maps")
        .upsert(relationshipChunks[i], { 
          onConflict: "account_id,seller_id",
          ignoreDuplicates: false 
        });

      if (error) {
        throw new Error(`Failed to upsert relationships batch ${i + 1}: ${error.message}`);
      }
      
      // Small delay between batches to prevent overwhelming the database
      if (i < relationshipChunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  // Create snapshot for original_relationships table - ONLY for relationships marked as "original"
  if (originalRelationships.length > 0) {
    const snapshotRows = originalRelationships.map(({ account_id, seller_id }) => ({
      account_id,
      seller_id,
    }));

    const snapshotChunks = chunk(snapshotRows, RELATIONSHIP_BATCH_SIZE);

    for (let i = 0; i < snapshotChunks.length; i++) {
      console.log(`🔍 Processing original_relationships batch ${i + 1}/${snapshotChunks.length} (${snapshotChunks[i].length} records)`);
      
      const { error } = await supabase
        .from("original_relationships")
        .upsert(snapshotChunks[i], { 
          onConflict: "account_id,seller_id",
          ignoreDuplicates: false 
        });

      if (error) {
        throw new Error(`Failed to create original snapshot batch ${i + 1}: ${error.message}`);
      }
      
      // Small delay between batches to prevent overwhelming the database
      if (i < snapshotChunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  // Refresh materialized views to update dashboard data
  try {
    await supabase.rpc('smart_refresh_performance_views');
  } catch (refreshError) {
    // Don't fail the import if refresh fails
  }


  // Log audit event
  if (userId) {
    const auditData = createAuditLogData(
      userId,
      'data_import',
      AUDIT_ENTITIES.RELATIONSHIP,
      undefined,
      null,
      {
        import_type: 'relationship_map',
        records_count: relationshipsToUpsert.length,
        original_count: originalRelationships.length,
        file_name: file.name,
        file_size: file.size,
      }
    );
    
    await logAuditEvent(auditData);
  }
}

// ========== Managers.xlsx ==========
type ManagerRow = {
  manager_name: string;
  manager_email: string;
  user_id?: string;
};

export async function importManagers(file: File, userId?: string) {
  const wb = await readSheet(file);
  const rows = sheetToJson<ManagerRow>(wb);

  if (rows.length === 0) throw new Error("Managers.xlsx is empty");

  const required = ["manager_name", "manager_email"];
  for (const r of required) {
    if (!(rows[0] as any)?.[r]) {
      throw new Error(`Managers.xlsx missing required column: ${r}`);
    }
  }

  // Prefetch profiles
  const { data: profiles, error: profileErr } = await supabase
    .from("profiles")
    .select("id,email");

  if (profileErr) throw new Error(`Failed to fetch profiles: ${profileErr.message}`);

  const profileMap = new Map(profiles?.map(p => [p.email.toLowerCase(), p.id]) ?? []);

  // Filter and validate data, then remove duplicates
  const managersToUpsert = rows
    .filter(r => r.manager_name && r.manager_email)
    .map(r => {
      const userId = profileMap.get(r.manager_email.toLowerCase());
      if (!userId) {
        throw new Error(`Manager email not found in profiles: ${r.manager_email}`);
      }
      return {
        name: r.manager_name,
        user_id: userId,
      };
    });

  // Remove duplicates based on user_id (keep first occurrence)
  const uniqueManagers = managersToUpsert.filter((manager, index, self) => 
    index === self.findIndex(m => m.user_id === manager.user_id)
  );

  
  if (managersToUpsert.length !== uniqueManagers.length) {
  }


  const managerChunks = chunk(uniqueManagers, BATCH_SIZE);

  for (let i = 0; i < managerChunks.length; i++) {
    const { error } = await supabase
      .from("managers")
      .upsert(managerChunks[i], { onConflict: "user_id" });

    if (error) throw new Error(`Failed to upsert managers batch ${i + 1}: ${error.message}`);
  }


  // Refresh materialized views to update dashboard data
  try {
    await supabase.rpc('smart_refresh_performance_views');
  } catch (refreshError) {
    // Don't fail the import if refresh fails
  }

  // Log audit event
  if (userId) {
    const auditData = createAuditLogData(
      userId,
      'data_import',
      AUDIT_ENTITIES.MANAGER,
      undefined,
      null,
      {
        import_type: 'managers',
        records_count: uniqueManagers.length,
        file_name: file.name,
        file_size: file.size,
      }
    );
    
    await logAuditEvent(auditData);
    
    // Refresh materialized views to update dashboard data
    try {
      await supabase.rpc('smart_refresh_performance_views');
    } catch (refreshError) {
      // Don't fail the import if refresh fails
    }
  }
}

// ========== ManagerTeam.xlsx ==========
type ManagerTeamRow = {
  manager_name: string;
  seller_name: string;
  is_primary?: boolean;
};

export async function importManagerTeam(file: File, userId?: string) {
  const wb = await readSheet(file);
  const rows = sheetToJson<ManagerTeamRow>(wb);

  if (rows.length === 0) throw new Error("ManagerTeam.xlsx is empty");

  const required = ["manager_name", "seller_name"];
  for (const r of required) {
    if (!(rows[0] as any)?.[r]) {
      throw new Error(`ManagerTeam.xlsx missing required column: ${r}`);
    }
  }

  // Prefetch managers and sellers

  // Fetch all sellers with pagination to get all records
  let allSellers: any[] = [];
  let from = 0;
  const limit = 1000;
  let hasMore = true;
  
  while (hasMore) {
    const { data, error } = await supabase
      .from("sellers")
      .select("id,name")
      .range(from, from + limit - 1);
    
    if (error) throw new Error(`Failed to fetch sellers: ${error.message}`);
    
    if (data && data.length > 0) {
      allSellers = allSellers.concat(data);
      from += limit;
    } else {
      hasMore = false;
    }
    
    // Safety check to prevent infinite loop
    if (from > 10000) {
      break;
    }
  }
  

  const managersRes = await supabase.from("managers").select("id,name");

  if (managersRes.error) throw new Error(`Failed to fetch managers: ${managersRes.error.message}`);

  const managerMap = new Map(managersRes.data?.map(m => [m.name.toLowerCase(), m.id]) ?? []);
  const sellerMap = new Map(allSellers.map(s => [s.name, s.id]));


  // Collect missing managers and sellers for reporting
  const missingManagers = new Set<string>();
  const missingSellers = new Set<string>();
  const updates: Array<{ sellerId: string; managerId: string; is_primary?: boolean }> = [];

  for (const r of rows) {
    if (!r.manager_name || !r.seller_name) continue;

    const managerId = managerMap.get(r.manager_name.toLowerCase());
    const sellerId = sellerMap.get(r.seller_name);

    if (!managerId) {
      missingManagers.add(r.manager_name);
      continue;
    }

    if (!sellerId) {
      missingSellers.add(r.seller_name);
      
      // Show similar seller names for debugging
      const similarSellers = Array.from(sellerMap.keys()).filter(name => 
        name.toLowerCase().includes(r.seller_name.toLowerCase()) || 
        r.seller_name.toLowerCase().includes(name.toLowerCase())
      );
      if (similarSellers.length > 0) {
      }
      
      // Check for exact match with different case
      const exactMatch = Array.from(sellerMap.keys()).find(name => 
        name.toLowerCase() === r.seller_name.toLowerCase()
      );
      if (exactMatch) {
      }
      
      continue;
    }

    updates.push({ sellerId, managerId, is_primary: r.is_primary });
  }

  // Report missing data
  if (missingManagers.size > 0) {
    throw new Error(`Managers not found (must run Managers.xlsx import first): ${Array.from(missingManagers).join(", ")}`);
  }
  
  if (missingSellers.size > 0) {
  }


  // Batch create seller-manager relationships
  const updateChunks = chunk(updates, BATCH_SIZE);
  let totalImported = 0;

  for (let i = 0; i < updateChunks.length; i++) {

    const chunk = updateChunks[i];
    
    // Check for existing relationships first
    const existingRelationships = await supabase
      .from("seller_managers")
      .select("seller_id, manager_id")
      .in("seller_id", chunk.map(u => u.sellerId))
      .in("manager_id", chunk.map(u => u.managerId));

    const existingSet = new Set(
      existingRelationships.data?.map(r => `${r.seller_id}-${r.manager_id}`) || []
    );

    // Filter out existing relationships
    const newRelationships = chunk.filter(u => 
      !existingSet.has(`${u.sellerId}-${u.managerId}`)
    );

    if (newRelationships.length === 0) {
      totalImported += chunk.length;
      continue;
    }

    // Insert new relationships
    const relationshipsToInsert = newRelationships.map(u => ({
      seller_id: u.sellerId,
      manager_id: u.managerId,
      is_primary: u.is_primary ?? true // Use Excel value or default to true
    }));

    const { error } = await supabase
      .from("seller_managers")
      .insert(relationshipsToInsert);

    if (error) {
      throw new Error(`Failed to create seller-manager relationships: ${error.message}`);
    }

    totalImported += newRelationships.length;
  }


  // Refresh materialized views to update dashboard data
  try {
    await supabase.rpc('smart_refresh_performance_views');
  } catch (refreshError) {
    // Don't fail the import if refresh fails
  }

  // Log audit event
  if (userId) {
    const auditData = createAuditLogData(
      userId,
      'data_import',
      AUDIT_ENTITIES.MANAGER,
      undefined,
      null,
      {
        import_type: 'manager_team',
        records_count: totalImported,
        file_name: file.name,
        file_size: file.size,
        assignments_count: updates.length,
      }
    );
    
    await logAuditEvent(auditData);
  }
}

// ========== ADD Mode Import Functions (Insert New Records, Keep Existing) ==========

// ADD Mode: Import new data without deleting existing records
export async function importComprehensiveDataAdd(file: File, userId?: string, onProgress?: ImportProgressCallback) {
  onProgress?.("🚀 Starting ADD MODE comprehensive import...");
  onProgress?.(`⏰ Start Time: ${new Date().toISOString()}`);
  
  const wb = await readSheet(file);
  const results: any = {};

  try {
    // 1. Import Managers (ADD mode - no deletion)
    onProgress?.("📋 Processing Managers sheet...");
    if (wb.SheetNames.includes("Managers")) {
      const managerRows = sheetToJson<ManagerRow>(wb, "Managers");
      if (managerRows.length > 0) {
        const { imported, errors } = await importManagersAdd(managerRows, userId);
        results.managers = { imported, errors };
        onProgress?.(`✅ Managers: ${imported} imported, ${errors.length} errors`);
      }
    } else {
      onProgress?.("⚠️ No Managers sheet found in Excel file");
    }

    // 2. Import Accounts (ADD mode - no deletion)
    if (wb.SheetNames.includes("Accounts")) {
      const accountRows = sheetToJson<AccountRow>(wb, "Accounts");
      if (accountRows.length > 0) {
        const { imported, errors } = await importAccountsAdd(accountRows, userId);
        results.accounts = { imported, errors };
      }
    } else {
    }

    // 3. Import Sellers (ADD mode - no deletion)
    if (wb.SheetNames.includes("Sellers")) {
      const sellerRows = sheetToJson<SellerRow>(wb, "Sellers");
      if (sellerRows.length > 0) {
        const { imported, errors } = await importSellersAdd(sellerRows, userId);
        results.sellers = { imported, errors };
      }
    } else {
    }

    // 4. Import Relationship Maps (ADD mode - no deletion)
    if (wb.SheetNames.includes("Relationship_Map")) {
      const relRows = sheetToJson<RelRow>(wb, "Relationship_Map");
      if (relRows.length > 0) {
        const { imported, errors } = await importRelationshipMapAdd(relRows, userId);
        results.relationships = { imported, errors };
      }
    } else {
    }

    // 5. Import Manager Team assignments (ADD mode - no deletion)
    if (wb.SheetNames.includes("Manager_Team")) {
      const mgrTeamRows = sheetToJson<ManagerTeamRow>(wb, "Manager_Team");
      if (mgrTeamRows.length > 0) {
        const { imported, errors } = await importManagerTeamAdd(mgrTeamRows, userId);
        results.manager_assignments = { imported, errors };
      }
    } else {
    }
    
    // Refresh materialized views to update dashboard data
    onProgress?.("🔄 Refreshing materialized views after ADD import...");
    try {
      await supabase.rpc('smart_refresh_performance_views');
      onProgress?.("✅ Materialized views refreshed successfully");
    } catch (refreshError) {
      onProgress?.(`❌ Error refreshing materialized views: ${refreshError}`);
      // Don't fail the import if refresh fails
    }

    // Log comprehensive audit event
    if (userId) {
      const auditData = createAuditLogData(
        userId,
        'data_import',
        'COMPREHENSIVE_ADD',
        undefined,
        null,
        {
          import_type: 'comprehensive_add',
          file_name: file.name,
          file_size: file.size,
          results: results
        }
      );
      
      await logAuditEvent(auditData);
    }
    
    // Final summary
    Object.entries(results).forEach(([key, result]: [string, any]) => {
    });

    return results;
  } catch (error) {
    throw error;
  }
}

// ADD Mode: Import managers without deleting existing ones
async function importManagersAdd(rows: ManagerRow[], userId?: string) {
  const required = ["manager_name", "user_id"];
  for (const r of required) {
    if (!(rows[0] as any)?.[r]) {
      throw new Error(`Managers file missing required column: ${r}`);
    }
  }

  const managersToInsert = rows
    .filter(r => r.manager_name && r.user_id)
    .map(r => ({
      name: r.manager_name,
      user_id: r.user_id!,
    }));

  // Remove duplicates based on user_id (keep first occurrence)
  const uniqueManagers = managersToInsert.filter((manager, index, self) => 
    index === self.findIndex(m => m.user_id === manager.user_id)
  );


  const managerChunks = chunk(uniqueManagers, BATCH_SIZE);
  let imported = 0;
  const errors: any[] = [];

  for (let i = 0; i < managerChunks.length; i++) {
    const { error } = await supabase
      .from("managers")
      .insert(managerChunks[i]);

    if (error) {
      errors.push({ batch: i + 1, error });
    } else {
      imported += managerChunks[i].length;
    }
  }


  // Log audit event
  if (userId) {
    const auditData = createAuditLogData(
      userId,
      'data_import',
      AUDIT_ENTITIES.MANAGER,
      undefined,
      null,
      {
        import_type: 'managers_add',
        records_count: imported,
        operation: 'insert',
      }
    );
    
    await logAuditEvent(auditData);
  }

  return { imported, errors };
}

// ADD Mode: Import accounts without deleting existing ones
async function importAccountsAdd(rows: AccountRow[], userId?: string) {
  const required = ["account_name", "size", "current_division"];
  for (const r of required) {
    if (!(rows[0] as any)?.[r]) {
      throw new Error(`Accounts file missing required column: ${r}`);
    }
  }

  const divisionMap: Record<string, string> = {
    "ESG": "ESG",
    "GDT": "GDT", 
    "GVC": "GVC",
    "MSG US": "MSG_US",
    "MSG_US": "MSG_US",
    "Mixed": "MIXED",
  };

  const sizeMap: Record<string, string> = {
    "enterprise": "enterprise",
    "Enterprise": "enterprise",
    "ENTERPRISE": "enterprise",
    "midmarket": "midmarket", 
    "Midmarket": "midmarket",
    "MIDMARKET": "midmarket",
    "no_data": "no_data",
    "No data": "no_data",
    "No Data": "no_data",
    "NO_DATA": "no_data",
    "-": "no_data",
    "": "no_data",
    "N/A": "no_data",
    "Unknown": "no_data",
  };

  const accountsToInsert = rows
    .filter(r => r.account_name)
    .map(r => {
      const normalizedDivision = divisionMap[r.current_division];
      if (!normalizedDivision) {
        throw new Error(`Invalid division: ${r.current_division}`);
      }
      
      const normalizedSize = sizeMap[r.size];
      if (!normalizedSize) {
        throw new Error(`Invalid size: ${r.size}. Must be 'enterprise' or 'midmarket'`);
      }
      
      // Get lat/lng from country or state mapping if not provided
      let lat = r.latitude;
      let lng = r.longitude;
      
      if (!lat || !lng) {
        // Try state mapping first (more specific) - skip if "N/A", "No data", "Wi"/"WI", or "Distributed"
        if (r.state && r.state !== "N/A" && r.state !== "No data" && r.state.toUpperCase() !== "WI" && r.state !== "Distributed") {
          const stateCoords = getStateCoordinates(r.state.toUpperCase());
          if (stateCoords) {
            lat = lat || stateCoords.latitude;
            lng = lng || stateCoords.longitude;
          }
        }
        
        // Fall back to country mapping if state not found - skip if "N/A" or "No data"
        if (r.country && r.country !== "N/A" && r.country !== "No data" && (!lat || !lng)) {
          const countryCoords = getCountryCoordinates(r.country);
          if (countryCoords) {
            lat = lat || countryCoords.latitude;
            lng = lng || countryCoords.longitude;
          }
        }
      }
      
      return {
        name: r.account_name,
        industry: r.industry,
        size: normalizedSize as any,
        tier: r.tier,
        type: r.type,
        state: r.state,
        city: r.city,
        country: r.country,
        lat: lat,
        lng: lng,
        current_division: normalizedDivision as any,
      };
    });

  // Remove duplicates based on name (keep first occurrence)
  const uniqueAccounts = accountsToInsert.filter((account, index, self) => 
    index === self.findIndex(a => a.name === account.name)
  );


  const accountChunks = chunk(uniqueAccounts, BATCH_SIZE);
  const allAccounts: Array<{ id: string; name: string }> = [];
  let imported = 0;
  const errors: any[] = [];

  for (let i = 0; i < accountChunks.length; i++) {
    const { data, error } = await supabase
      .from("accounts")
      .insert(accountChunks[i])
      .select("id,name");

    if (error) {
      errors.push({ batch: i + 1, error });
    } else {
      if (data) allAccounts.push(...data);
      imported += accountChunks[i].length;
    }
  }

  // Build name->id map
  const accountMap = new Map(allAccounts.map(a => [a.name, a.id]));

  // Insert revenue data for new accounts
  const revenuesToInsert = rows
    .filter(r => r.account_name && accountMap.has(r.account_name))
    .map(r => ({
      account_id: accountMap.get(r.account_name)!,
      revenue_esg: r.revenue_ESG ?? 0,
      revenue_gdt: r.revenue_GDT ?? 0,
      revenue_gvc: r.revenue_GVC ?? 0,
      revenue_msg_us: r.revenue_MSG_US ?? 0,
    }));

  // Remove duplicate revenues (keep first occurrence per account)
  const uniqueRevenues = revenuesToInsert.filter((revenue, index, self) => 
    index === self.findIndex(r => r.account_id === revenue.account_id)
  );


  const revenueChunks = chunk(uniqueRevenues, BATCH_SIZE);

  for (let i = 0; i < revenueChunks.length; i++) {
    const { error } = await supabase
      .from("account_revenues")
      .insert(revenueChunks[i]);

    if (error) {
      errors.push({ batch: i + 1, error });
    }
  }


  // Log audit event
  if (userId) {
    const auditData = createAuditLogData(
      userId,
      'data_import',
      AUDIT_ENTITIES.ACCOUNT,
      undefined,
      null,
      {
        import_type: 'accounts_add',
        records_count: imported,
        revenue_records_count: uniqueRevenues.length,
        operation: 'insert',
      }
    );
    
    await logAuditEvent(auditData);
  }

  return { imported, errors };
}

// ADD Mode: Import sellers without deleting existing ones
async function importSellersAdd(rows: SellerRow[], userId?: string) {
  const required = ["seller_name", "division", "size"];
  for (const r of required) {
    if (!(rows[0] as any)?.[r]) {
      throw new Error(`Sellers file missing required column: ${r}`);
    }
  }

  const divisionMap: Record<string, string> = {
    "ESG": "ESG",
    "GDT": "GDT",
    "GVC": "GVC",
    "MSG US": "MSG_US",
    "MSG_US": "MSG_US",
    "Mixed": "MIXED",
  };

  const sizeMap: Record<string, string> = {
    "enterprise": "enterprise",
    "Enterprise": "enterprise",
    "ENTERPRISE": "enterprise",
    "midmarket": "midmarket", 
    "Midmarket": "midmarket",
    "MIDMARKET": "midmarket",
    "no_data": "no_data",
    "No data": "no_data",
    "No Data": "no_data",
    "NO_DATA": "no_data",
    "-": "midmarket",
    "": "midmarket",
    "N/A": "midmarket",
    "Unknown": "midmarket",
  };

  const sellersToInsert = rows
    .filter(r => r.seller_name)
    .map(r => {
      const normalizedDivision = divisionMap[r.division];
      if (!normalizedDivision) {
        throw new Error(`Invalid division: ${r.division}`);
      }

      const normalizedSize = sizeMap[r.size];
      if (!normalizedSize) {
        throw new Error(`Invalid size: ${r.size}. Must be 'enterprise' or 'midmarket'`);
      }

      // Get lat/lng from country or state mapping if not provided
      let lat = r.latitude;
      let lng = r.longitude;
      
      if (!lat || !lng) {
        // Try state mapping first (more specific) - skip if "N/A", "No data", "Wi"/"WI", or "Distributed"
        if (r.state && r.state !== "N/A" && r.state !== "No data" && r.state.toUpperCase() !== "WI" && r.state !== "Distributed") {
          const stateCoords = getStateCoordinates(r.state.toUpperCase());
          if (stateCoords) {
            lat = lat || stateCoords.latitude;
            lng = lng || stateCoords.longitude;
          }
        }
        
        // Fall back to country mapping if state not found - skip if "N/A" or "No data"
        if (r.country && r.country !== "N/A" && r.country !== "No data" && (!lat || !lng)) {
          const countryCoords = getCountryCoordinates(r.country);
          if (countryCoords) {
            lat = lat || countryCoords.latitude;
            lng = lng || countryCoords.longitude;
          }
        }
      }

      return {
        name: r.seller_name,
        division: normalizedDivision as any,
        size: normalizedSize as any,
        industry_specialty: r.industry_specialty,
        state: r.state,
        city: r.city,
        country: r.country,
        lat: lat,
        lng: lng,
        tenure_months: r.hire_date ? calculateTenureMonths(r.hire_date) : null,
        seniority_type: r.seniority_type || null,
        manager_id: null, // Will be assigned later via ManagerTeam import
        book_finalized: r.book_finalized || false, // Preserve book_finalized status
      };
    });


  const sellerChunks = chunk(sellersToInsert, BATCH_SIZE);
  let imported = 0;
  const errors: any[] = [];

  for (let i = 0; i < sellerChunks.length; i++) {
    const { error } = await supabase
      .from("sellers")
      .insert(sellerChunks[i]);

    if (error) {
      errors.push({ batch: i + 1, error });
    } else {
      imported += sellerChunks[i].length;
    }
  }


  // Log audit event
  if (userId) {
    const auditData = createAuditLogData(
      userId,
      'data_import',
      AUDIT_ENTITIES.SELLER,
      undefined,
      null,
      {
        import_type: 'sellers_add',
        records_count: imported,
        operation: 'insert',
      }
    );
    
    await logAuditEvent(auditData);
  }

  return { imported, errors };
}

// ADD Mode: Import relationships without deleting existing ones
async function importRelationshipMapAdd(rows: RelRow[], userId?: string) {
  const required = ["account_name", "seller_name"];
  for (const r of required) {
    if (!(rows[0] as any)?.[r]) {
      throw new Error(`Relationship file missing required column: ${r}`);
    }
  }

  // Get all accounts and sellers for mapping (fetch fresh data with pagination)
  console.log("🔄 Fetching fresh account and seller data for relationship mapping...");
  
  // Fetch all accounts with pagination to avoid 1000 row limit
  let allAccounts: any[] = [];
  let from = 0;
  const limit = 1000;
  
  while (true) {
    const { data: accountsBatch, error: accountsError } = await supabase
      .from("accounts")
      .select("id,name")
      .range(from, from + limit - 1);
    
    if (accountsError) {
      throw new Error(`Failed to fetch accounts: ${accountsError.message}`);
    }
    
    if (!accountsBatch || accountsBatch.length === 0) break;
    
    allAccounts.push(...accountsBatch);
    from += limit;
    
    if (accountsBatch.length < limit) break; // Last batch
  }
  
  // Fetch all sellers (should be under 1000)
  const { data: sellers, error: sellersError } = await supabase.from("sellers").select("id,name");
  
  if (sellersError) {
    throw new Error(`Failed to fetch sellers: ${sellersError.message}`);
  }
  
  if (!sellers) {
    throw new Error("Failed to fetch sellers for relationship mapping");
  }
  
  console.log(`📊 Fresh data fetched - Accounts: ${allAccounts.length}, Sellers: ${sellers.length}`);

  const accountMap = new Map(allAccounts.map(a => [a.name, a.id]));
  const sellerMap = new Map(sellers.map(s => [s.name, s.id]));

  // Map relationships - separate original from active relationships
  const allRelationships = rows
    .filter(r => r.account_name && r.seller_name)
    .map(r => {
      const accountId = accountMap.get(r.account_name);
      const sellerId = sellerMap.get(r.seller_name);
      
      if (!accountId || !sellerId) {
        if (!accountId) {
          console.log(`❌ Account NOT FOUND: "${r.account_name}"`);
          // Show first few available account names for debugging
          const availableAccounts = Array.from(accountMap.keys()).slice(0, 5);
          console.log(`   Available accounts (first 5): ${availableAccounts.join(', ')}`);
        }
        if (!sellerId) {
          console.log(`❌ Seller NOT FOUND: "${r.seller_name}"`);
          // Show first few available seller names for debugging
          const availableSellers = Array.from(sellerMap.keys()).slice(0, 5);
          console.log(`   Available sellers (first 5): ${availableSellers.join(', ')}`);
        }
        return null;
      }

      const isOriginal = (r.status || "").toLowerCase() === "original";
      
      // Validate status for non-original relationships
      if (!isOriginal) {
        const mappedStatus = statusMap[r.status || "must_keep"];
        if (!mappedStatus) {
          throw new Error(`Invalid status: ${r.status}. Valid options are: original, must_keep, for_discussion, to_be_peeled`);
        }
      }

      return {
        account_id: accountId,
        seller_id: sellerId,
        status: isOriginal ? null : statusMap[r.status || "must_keep"] as any,
        is_original: isOriginal,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  // Split into two groups: original and active relationships
  const originalRelationships = allRelationships.filter(r => r.is_original);
  const relationshipsToInsert = allRelationships.filter(r => !r.is_original && r.status);
  
  console.log(`📊 Relationship Processing Summary:`);
  console.log(`  📋 Total rows processed: ${rows.length}`);
  console.log(`  🔗 Valid relationships found: ${allRelationships.length}`);
  console.log(`  📝 Original relationships: ${originalRelationships.length}`);
  console.log(`  📝 Active relationships (must_keep, etc.): ${relationshipsToInsert.length}`);
  console.log(`  ❌ Filtered out (name mismatches): ${rows.length - allRelationships.length}`);

  // Insert active relationships (exclude is_original field from database insert)
  let imported = 0;
  const errors: any[] = [];

  if (relationshipsToInsert.length > 0) {
    const relChunks = chunk(
      relationshipsToInsert.map(({ account_id, seller_id, status }) => ({
        account_id,
        seller_id,
        status
      })),
      RELATIONSHIP_BATCH_SIZE
    );

    for (let i = 0; i < relChunks.length; i++) {
      const { error } = await supabase
        .from("relationship_maps")
        .insert(relChunks[i]);

      if (error) {
        const errorMessage = error.code === '23505' 
          ? `Duplicate key constraint violation in batch ${i + 1}: ${error.message}`
          : error.code === '409'
          ? `Conflict error in batch ${i + 1}: Duplicate relationships detected - ${error.message}`
          : `Batch ${i + 1} failed: ${error.message}`;
        errors.push({ batch: i + 1, error: errorMessage });
        console.log(`❌ Relationship batch ${i + 1} failed:`, error);
      } else {
        imported += relChunks[i].length;
      }
    }
  }

  // Add to original_relationships table - ONLY for relationships marked as "original"
  if (originalRelationships.length > 0) {
    const snapshotRows = originalRelationships.map(({ account_id, seller_id }) => ({
      account_id,
      seller_id,
    }));

    const snapshotChunks = chunk(snapshotRows, RELATIONSHIP_BATCH_SIZE);

    for (let i = 0; i < snapshotChunks.length; i++) {
      const { error } = await supabase
        .from("original_relationships")
        .upsert(snapshotChunks[i], { 
          onConflict: "account_id,seller_id",
          ignoreDuplicates: false 
        });

      if (error) {
        const errorMessage = error.code === '23505' 
          ? `Duplicate key constraint violation in original relationships batch ${i + 1}: ${error.message}`
          : error.code === '409'
          ? `Conflict error in original relationships batch ${i + 1}: Duplicate relationships detected - ${error.message}`
          : `Failed to add original relationships batch ${i + 1}: ${error.message}`;
        errors.push({ batch: i + 1, error: errorMessage });
        console.log(`❌ Original relationships batch ${i + 1} failed:`, error);
      }
    }
  }

  // Log audit event
  if (userId) {
    const auditData = createAuditLogData(
      userId,
      'data_import',
      AUDIT_ENTITIES.RELATIONSHIP,
      undefined,
      null,
      {
        import_type: 'relationships_add',
        records_count: imported,
        original_relationships_count: originalRelationships.length,
        operation: 'insert',
      }
    );
    
    await logAuditEvent(auditData);
  }

  return { imported, errors };
}

// ADD Mode: Import manager team assignments without deleting existing ones
async function importManagerTeamAdd(rows: ManagerTeamRow[], userId?: string) {
  const required = ["manager_name", "seller_name"];
  for (const r of required) {
    if (!(rows[0] as any)?.[r]) {
      throw new Error(`ManagerTeam file missing required column: ${r}`);
    }
  }

  // Get all managers and sellers for mapping
  const { data: managers } = await supabase.from("managers").select("id,name");
  const { data: sellers } = await supabase.from("sellers").select("id,name");

  if (!managers || !sellers) {
    throw new Error("Failed to fetch managers or sellers for team assignment");
  }

  const managerMap = new Map(managers.map(m => [m.name, m.id]));
  const sellerMap = new Map(sellers.map(s => [s.name, s.id]));

  const updates = rows
    .filter(r => r.manager_name && r.seller_name)
    .map(r => ({
      seller_id: sellerMap.get(r.seller_name),
      manager_id: managerMap.get(r.manager_name),
      is_primary: r.is_primary ?? true // Use Excel value or default to true
    }))
    .filter(u => u.seller_id && u.manager_id);


  let imported = 0;
  const errors: any[] = [];

  for (const update of updates) {
    // Check if this seller-manager relationship already exists
    const { data: existing } = await supabase
      .from("seller_managers")
      .select("id")
      .eq("seller_id", update.seller_id!)
      .eq("manager_id", update.manager_id!)
      .single();

    if (existing) {
      imported++;
      continue;
    }

    // Insert new seller-manager relationship
    const { error } = await supabase
      .from("seller_managers")
      .insert({
        seller_id: update.seller_id!,
        manager_id: update.manager_id!,
        is_primary: update.is_primary ?? true // Use Excel value or default to true
      });

    if (error) {
      errors.push({ seller_id: update.seller_id, manager_id: update.manager_id, error });
    } else {
      imported++;
    }
  }


  // Log audit event
  if (userId) {
    const auditData = createAuditLogData(
      userId,
      'data_import',
      AUDIT_ENTITIES.MANAGER,
      undefined,
      null,
      {
        import_type: 'manager_team_add',
        records_count: imported,
        operation: 'update',
      }
    );
    
    await logAuditEvent(auditData);
  }

  return { imported, errors };
}

// ========== Individual Import Functions (Upsert Operations) ==========

// Individual Sellers Import (Upsert - preserves existing relationships)
export async function importSellersIndividual(file: File, userId?: string, onProgress?: ImportProgressCallback) {
  const wb = await readSheet(file);
  const rows = sheetToJson<SellerRow>(wb);

  if (rows.length === 0) throw new Error("Sellers file is empty");

  const required = ["seller_name", "division", "size"];
  for (const r of required) {
    if (!(rows[0] as any)?.[r]) {
      throw new Error(`Sellers file missing required column: ${r}`);
    }
  }

  const divisionMap: Record<string, string> = {
    "ESG": "ESG",
    "GDT": "GDT",
    "GVC": "GVC",
    "MSG US": "MSG_US",
    "MSG_US": "MSG_US",
    "Mixed": "MIXED",
  };

  const sizeMap: Record<string, string> = {
    "enterprise": "enterprise",
    "Enterprise": "enterprise",
    "ENTERPRISE": "enterprise",
    "midmarket": "midmarket", 
    "Midmarket": "midmarket",
    "MIDMARKET": "midmarket",
    "no_data": "no_data",
    "No data": "no_data",
    "No Data": "no_data",
    "NO_DATA": "no_data",
    "-": "midmarket",
    "": "midmarket",
    "N/A": "midmarket",
    "Unknown": "midmarket",
  };

  // Prepare seller data for upsert
  const sellersToUpsert = rows
    .filter(r => r.seller_name)
    .map(r => {
      const normalizedDivision = divisionMap[r.division];
      if (!normalizedDivision) {
        throw new Error(`Invalid division: ${r.division}`);
      }

      const normalizedSize = sizeMap[r.size];
      if (!normalizedSize) {
        throw new Error(`Invalid size: ${r.size}. Must be 'enterprise' or 'midmarket'`);
      }

      return {
        name: r.seller_name,
        division: normalizedDivision as any,
        size: normalizedSize as any,
        industry_specialty: r.industry_specialty,
        state: r.state,
        city: r.city,
        country: r.country,
        lat: r.latitude,
        lng: r.longitude,
        tenure_months: r.hire_date ? calculateTenureMonths(r.hire_date) : null,
        seniority_type: r.seniority_type || null,
        // Note: manager_id is preserved from existing data during upsert
      };
    });


  // Batch upsert sellers (preserves existing manager_id and relationships)
  const sellerChunks = chunk(sellersToUpsert, BATCH_SIZE);

  for (let i = 0; i < sellerChunks.length; i++) {
    const { error } = await supabase
      .from("sellers")
      .upsert(sellerChunks[i], { onConflict: "name" });

    if (error) throw new Error(`Failed to upsert sellers batch ${i + 1}: ${error.message}`);
  }


  // Refresh materialized views to update dashboard data
  try {
    await supabase.rpc('smart_refresh_performance_views');
  } catch (refreshError) {
    // Don't fail the import if refresh fails
  }

  // Log audit event
  if (userId) {
    const auditData = createAuditLogData(
      userId,
      'data_import',
      AUDIT_ENTITIES.SELLER,
      undefined,
      null,
      {
        import_type: 'sellers_individual',
        records_count: sellersToUpsert.length,
        file_name: file.name,
        file_size: file.size,
        operation: 'upsert',
      }
    );
    
    await logAuditEvent(auditData);
  }
}

// Individual Accounts Import (Upsert - preserves existing relationships)
export async function importAccountsIndividual(file: File, userId?: string, onProgress?: ImportProgressCallback) {
  const wb = await readSheet(file);
  const rows = sheetToJson<AccountRow>(wb);

  if (rows.length === 0) throw new Error("Accounts file is empty");

  const required = ["account_name", "size", "current_division"];
  for (const r of required) {
    if (!(rows[0] as any)?.[r]) {
      throw new Error(`Accounts file missing required column: ${r}`);
    }
  }

  const divisionMap: Record<string, string> = {
    "ESG": "ESG",
    "GDT": "GDT",
    "GVC": "GVC",
    "MSG US": "MSG_US",
    "MSG_US": "MSG_US",
    "Mixed": "MIXED",
  };

  const sizeMap: Record<string, string> = {
    "enterprise": "enterprise",
    "Enterprise": "enterprise",
    "ENTERPRISE": "enterprise",
    "midmarket": "midmarket", 
    "Midmarket": "midmarket",
    "MIDMARKET": "midmarket",
    "no_data": "no_data",
    "No data": "no_data",
    "No Data": "no_data",
    "NO_DATA": "no_data",
    "-": "no_data",
    "": "no_data",
    "N/A": "no_data",
    "Unknown": "no_data",
  };

  // Prepare account data for upsert
  const accountsToUpsert = rows
    .filter(r => r.account_name)
    .map(r => {
      const normalizedDivision = divisionMap[r.current_division];
      if (!normalizedDivision) {
        throw new Error(`Invalid division: ${r.current_division}`);
      }
      
      const normalizedSize = sizeMap[r.size];
      if (!normalizedSize) {
        throw new Error(`Invalid size: ${r.size}. Must be 'enterprise' or 'midmarket'`);
      }
      
      return {
        name: r.account_name,
        industry: r.industry,
        size: normalizedSize as any,
        tier: r.tier,
        type: r.type,
        state: r.state,
        city: r.city,
        country: r.country,
        lat: r.latitude,
        lng: r.longitude,
        current_division: normalizedDivision as any,
      };
    });

  // Remove duplicates based on name (keep first occurrence)
  const uniqueAccounts = accountsToUpsert.filter((account, index, self) => 
    index === self.findIndex(a => a.name === account.name)
  );


  // Batch upsert accounts (preserves existing relationships)
  const accountChunks = chunk(uniqueAccounts, BATCH_SIZE);
  const allAccounts: Array<{ id: string; name: string }> = [];

  for (let i = 0; i < accountChunks.length; i++) {
    const { data, error } = await supabase
      .from("accounts")
      .upsert(accountChunks[i], { onConflict: "name" })
      .select("id,name");

    if (error) throw new Error(`Failed to upsert accounts batch ${i + 1}: ${error.message}`);
    if (data) allAccounts.push(...data);
  }

  // Build name->id map
  const accountMap = new Map(allAccounts.map(a => [a.name, a.id]));

  // Prepare revenue data for upsert
  const revenuesToUpsert = rows
    .filter(r => r.account_name && accountMap.has(r.account_name))
    .map(r => ({
      account_id: accountMap.get(r.account_name)!,
      revenue_esg: r.revenue_ESG ?? 0,
      revenue_gdt: r.revenue_GDT ?? 0,
      revenue_gvc: r.revenue_GVC ?? 0,
      revenue_msg_us: r.revenue_MSG_US ?? 0,
    }));

  // Remove duplicate revenues (keep first occurrence per account)
  const uniqueRevenues = revenuesToUpsert.filter((revenue, index, self) => 
    index === self.findIndex(r => r.account_id === revenue.account_id)
  );


  // Batch upsert revenues
  const revenueChunks = chunk(uniqueRevenues, BATCH_SIZE);

  for (let i = 0; i < revenueChunks.length; i++) {
    const { error } = await supabase
      .from("account_revenues")
      .upsert(revenueChunks[i], { onConflict: "account_id" });

    if (error) throw new Error(`Failed to upsert revenues batch ${i + 1}: ${error.message}`);
  }


  // Refresh materialized views to update dashboard data
  try {
    await supabase.rpc('smart_refresh_performance_views');
  } catch (refreshError) {
    // Don't fail the import if refresh fails
  }

  // Log audit event
  if (userId) {
    const auditData = createAuditLogData(
      userId,
      'data_import',
      AUDIT_ENTITIES.ACCOUNT,
      undefined,
      null,
      {
        import_type: 'accounts_individual',
        records_count: uniqueAccounts.length,
        file_name: file.name,
        file_size: file.size,
        revenue_records_count: uniqueRevenues.length,
        operation: 'upsert',
      }
    );
    
    await logAuditEvent(auditData);
  }
}

// ========== Country & State Mapping ==========
import countryMap from '../../countrymap.json';
import countryIso from '../../countryiso.json';
import stateMap from '../../statemap.json';

interface CountryMapping {
  country: string;
  latitude: number;
  longitude: number;
}

interface CountryIso {
  Name: string;
  Code: string;
}

interface StateMapping {
  state: string;
  latitude: number;
  longitude: number;
  name: string;
}

// Get country mapping for lat/lng lookup
export function getCountryCoordinates(countryCode: string): { latitude: number; longitude: number } | null {
  const mapping = (countryMap as CountryMapping[]).find(c => c.country === countryCode);
  return mapping ? { latitude: mapping.latitude, longitude: mapping.longitude } : null;
}

// Get state mapping for lat/lng lookup
export function getStateCoordinates(stateCode: string): { latitude: number; longitude: number } | null {
  const mapping = (stateMap as StateMapping[]).find(s => s.state === stateCode);
  return mapping ? { latitude: mapping.latitude, longitude: mapping.longitude } : null;
}

// Get all available country codes for dropdown
export function getAvailableCountryCodes(): string[] {
  const countryCodes = (countryMap as CountryMapping[]).map(c => c.country);
  return ["N/A", ...countryCodes]; // Add "N/A" option
}

// Get all available state codes for dropdown
export function getAvailableStateCodes(): string[] {
  const stateCodes = (stateMap as StateMapping[]).map(s => s.state);
  return ["N/A", ...stateCodes]; // Add "N/A" option
}

// Get country reference data for template
export function getCountryReferenceData(): Array<{country_name: string, country_code: string}> {
  const countryData = (countryIso as CountryIso[]).map(c => ({
    country_name: c.Name,
    country_code: c.Code
  }));
  
  // Add "No data" option at the beginning
  return [
    { country_name: "No data", country_code: "N/A" },
    ...countryData
  ];
}

// Get state reference data for template
export function getStateReferenceData(): Array<{state_name: string, state_code: string}> {
  const stateData = (stateMap as StateMapping[]).map(s => ({
    state_name: s.name,
    state_code: s.state
  }));
  
  // Add "No data" option at the beginning
  return [
    { state_name: "No data", state_code: "N/A" },
    ...stateData
  ];
}


// Calculate tenure months from hire date
export function calculateTenureMonths(hireDate: string | Date | number): number | null {
  if (!hireDate) return null;
  
  try {
    let hire: Date;
    
    // Handle different input types
    if (typeof hireDate === 'string') {
      // Handle mm/dd/yy format specifically
      if (hireDate.includes('/')) {
        const parts = hireDate.split('/');
        if (parts.length === 3) {
          const month = parseInt(parts[0], 10);
          const day = parseInt(parts[1], 10);
          let year = parseInt(parts[2], 10);
          
          // Convert 2-digit year to 4-digit year
          if (year < 100) {
            // Assume years 00-30 are 2000-2030, years 31-99 are 1931-1999
            year += year <= 30 ? 2000 : 1900;
          }
          
          hire = new Date(year, month - 1, day); // month is 0-indexed in Date constructor
        } else {
          hire = new Date(hireDate);
        }
      } else {
        hire = new Date(hireDate);
      }
    } else if (typeof hireDate === 'number') {
      // Handle Excel serial number dates (days since 1900-01-01)
      // Excel serial numbers for dates are typically > 1 (1900-01-01 = 1)
      if (hireDate > 1 && hireDate < 100000) {
        // This looks like an Excel serial number
        const excelEpoch = new Date(1900, 0, 1); // January 1, 1900
        hire = new Date(excelEpoch.getTime() + (hireDate - 2) * 24 * 60 * 60 * 1000);
      } else {
        // Treat as timestamp
        hire = new Date(hireDate);
      }
    } else if (hireDate instanceof Date) {
      // Already a Date object
      hire = hireDate;
    } else {
      // Fallback to Date constructor
      hire = new Date(hireDate);
    }
    
    const now = new Date();
    
    // Check if the date is valid
    if (isNaN(hire.getTime())) return null;
    
    // Calculate the difference in months
    const yearDiff = now.getFullYear() - hire.getFullYear();
    const monthDiff = now.getMonth() - hire.getMonth();
    const totalMonths = yearDiff * 12 + monthDiff;
    
    // Ensure non-negative result
    return Math.max(0, totalMonths);
  } catch (error) {
    return null;
  }
}

// ========== Template Generation ==========

export function downloadTemplate(type: "accounts" | "sellers" | "managers" | "relmap" | "mgrteam") {
  let templateData: any[] = [];
  let filename = "";
  let sheetName = "";

  switch (type) {
    case "accounts":
      templateData = [
        {
          account_name: "Example Corp",
          industry: "Technology",
          size: "enterprise",
          tier: "Tier 1",
          type: "Strategic",
          state: "CA",
          city: "San Francisco",
          country: "US", // ISO code - lat/lng will be auto-mapped
          current_division: "ESG",
          revenue_ESG: 1000000,
          revenue_GDT: 500000,
          revenue_GVC: 750000,
          revenue_MSG_US: 250000
        }
      ];
      filename = "Accounts_Template.xlsx";
      sheetName = "Accounts";
      break;

    case "sellers":
      templateData = [
        {
          seller_name: "John Smith",
          division: "ESG",
          size: "enterprise",
          industry_specialty: "Financial Services",
          state: "NY",
          city: "New York",
          country: "US", // ISO code - lat/lng will be auto-mapped
          hire_date: "01/15/22", // Will be converted to tenure_months automatically
          seniority_type: "senior" // junior or senior
        }
      ];
      filename = "Sellers_Template.xlsx";
      sheetName = "Sellers";
      break;

    case "managers":
      templateData = [
        {
          manager_name: "Jane Manager",
          manager_email: "jane.manager@company.com"
        }
      ];
      filename = "Managers_Template.xlsx";
      sheetName = "Managers";
      break;

    case "relmap":
      templateData = [
        {
          account_name: "Example Corp",
          seller_name: "John Smith",
          status: "original"
        },
        {
          account_name: "Tech Solutions Inc",
          seller_name: "John Smith",
          status: "must_keep"
        },
        {
          account_name: "Innovation LLC",
          seller_name: "Sarah Johnson",
          status: "for_discussion"
        },
        {
          account_name: "Future Systems",
          seller_name: "Sarah Johnson",
          status: "to_be_peeled"
        }
      ];
      filename = "RelationshipMap_Template.xlsx";
      sheetName = "RelationshipMap";
      break;

    case "mgrteam":
      templateData = [
        {
          manager_name: "Jane Manager",
          seller_name: "John Smith",
          is_primary: true
        }
      ];
      filename = "ManagerTeam_Template.xlsx";
      sheetName = "ManagerTeam";
      break;
  }

  // Create workbook
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(templateData);
  
  // Add the worksheet to workbook
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  
  // Add Country and State Reference tabs for accounts and sellers templates
  if (type === "accounts" || type === "sellers") {
    const countryReferenceData = getCountryReferenceData();
    const countryWs = XLSX.utils.json_to_sheet(countryReferenceData);
    XLSX.utils.book_append_sheet(wb, countryWs, "Country_Reference");
    
    const stateReferenceData = getStateReferenceData();
    const stateWs = XLSX.utils.json_to_sheet(stateReferenceData);
    XLSX.utils.book_append_sheet(wb, stateWs, "State_Reference");
  }
  
  // Add helpful comments for name-based imports
  if (type === "relmap") {
    const noteRow = [
      "NOTE: account_name and seller_name are used for user-friendly imports.",
      "The system automatically maps these names to the corresponding UUIDs in the database.",
      "Make sure account and seller names match exactly with existing records."
    ];
    XLSX.utils.sheet_add_aoa(ws, [noteRow], { origin: -1 });
  }
  
  if (type === "mgrteam") {
    const noteRow = [
      "NOTE: manager_name and seller_name are used for user-friendly imports.",
      "The system automatically maps these names to the corresponding UUIDs in the database.",
      "Make sure manager and seller names match exactly with existing records.",
      "is_primary column: Set to TRUE for the primary manager, FALSE for secondary managers.",
      "If not specified, defaults to TRUE (primary manager)."
    ];
    XLSX.utils.sheet_add_aoa(ws, [noteRow], { origin: -1 });
  }
  
  if (type === "sellers") {
    const noteRow = [
      "NOTE: Manager assignments are handled via the Manager_Team tab.",
      "Use the Manager_Team tab to assign sellers to managers after importing sellers."
    ];
    XLSX.utils.sheet_add_aoa(ws, [noteRow], { origin: -1 });
  }
  
  if (type === "managers") {
    const noteRow = [
      "NOTE: manager_email must match an existing user email in the profiles table.",
      "The system will link the manager record to the existing user profile."
    ];
    XLSX.utils.sheet_add_aoa(ws, [noteRow], { origin: -1 });
  }
  
  // Generate and download file
  XLSX.writeFile(wb, filename);
}

// ========== Comprehensive Template Generation ==========

export function downloadComprehensiveTemplate() {
  // Create workbook
  const wb = XLSX.utils.book_new();
  
  // 1. ACCOUNTS TAB
  const accountsData = [
    {
      account_name: "Example Corp",
      industry: "Technology",
      size: "enterprise",
      tier: "Tier 1",
      type: "Strategic",
      state: "CA",
      city: "San Francisco",
      country: "US", // ISO code - lat/lng will be auto-mapped
      current_division: "ESG",
      revenue_ESG: 1000000,
      revenue_GDT: 500000,
      revenue_GVC: 750000,
      revenue_MSG_US: 250000
    },
    {
      account_name: "Tech Solutions Inc",
      industry: "Financial Services",
      size: "midmarket",
      tier: "Tier 2",
      type: "Growth",
      state: "NY",
      city: "New York",
      country: "US", // ISO code - lat/lng will be auto-mapped
      current_division: "GDT",
      revenue_ESG: 0,
      revenue_GDT: 800000,
      revenue_GVC: 200000,
      revenue_MSG_US: 0
    }
  ];
  
  const accountsWs = XLSX.utils.json_to_sheet(accountsData);
  XLSX.utils.book_append_sheet(wb, accountsWs, "Accounts");
  
  // 2. SELLERS TAB
  const sellersData = [
    {
      seller_name: "John Smith",
      division: "ESG",
      size: "enterprise",
      industry_specialty: "Financial Services",
      state: "NY",
      city: "New York",
      country: "US", // ISO code - lat/lng will be auto-mapped
      hire_date: "01/15/22", // Will be converted to tenure_months automatically
      seniority_type: "senior", // junior or senior
      book_finalized: false // Whether the seller's book is finalized
    },
    {
      seller_name: "Sarah Johnson",
      division: "GDT",
      size: "midmarket",
      industry_specialty: "Technology",
      state: "CA",
      city: "San Francisco",
      country: "US", // ISO code - lat/lng will be auto-mapped
      hire_date: "07/01/22", // Will be converted to tenure_months automatically
      seniority_type: "junior", // junior or senior
      book_finalized: true // Whether the seller's book is finalized
    }
  ];
  
  const sellersWs = XLSX.utils.json_to_sheet(sellersData);
  XLSX.utils.book_append_sheet(wb, sellersWs, "Sellers");
  
  // 3. MANAGERS TAB
  const managersData = [
    {
      manager_name: "Jane Manager",
      manager_email: "jane.manager@company.com"
    },
    {
      manager_name: "Mike Director",
      manager_email: "mike.director@company.com"
    }
  ];
  
  const managersWs = XLSX.utils.json_to_sheet(managersData);
  XLSX.utils.book_append_sheet(wb, managersWs, "Managers");
  
  // 4. RELATIONSHIP_MAP TAB
  const relationshipData = [
    {
      account_name: "Example Corp",
      seller_name: "John Smith",
      status: "original"
    },
    {
      account_name: "Tech Solutions Inc",
      seller_name: "Sarah Johnson",
      status: "must_keep"
    },
    {
      account_name: "Innovation Systems",
      seller_name: "John Smith",
      status: "for_discussion"
    },
    {
      account_name: "Future Tech",
      seller_name: "Sarah Johnson",
      status: "to_be_peeled"
    }
  ];
  
  const relationshipWs = XLSX.utils.json_to_sheet(relationshipData);
  XLSX.utils.book_append_sheet(wb, relationshipWs, "Relationship_Map");
  
  // 5. MANAGER_TEAM TAB
  const managerTeamData = [
    {
      manager_name: "Jane Manager",
      seller_name: "John Smith",
      is_primary: true
    },
    {
      manager_name: "Mike Director",
      seller_name: "Sarah Johnson",
      is_primary: true
    }
  ];
  
  const managerTeamWs = XLSX.utils.json_to_sheet(managerTeamData);
  XLSX.utils.book_append_sheet(wb, managerTeamWs, "Manager_Team");
  
  // 6. INSTRUCTIONS TAB
  const instructionsData = [
    ["BAIN DATA IMPORT TEMPLATE - INSTRUCTIONS"],
    [""],
    ["IMPORT ORDER (CRITICAL):"],
    ["1. Managers - Must be imported first"],
    ["2. Accounts - Import accounts and their revenue data"],
    ["3. Sellers - Import sellers (managers must exist first)"],
    ["4. Relationship_Map - Import account-seller relationships"],
    ["5. Manager_Team - Assign sellers to managers"],
    [""],
    ["TAB DESCRIPTIONS:"],
    ["• Accounts: Company information, location, division, and revenue data"],
    ["• Sellers: Sales team members with their specializations and managers"],
    ["• Managers: Team leaders (must have existing user profiles)"],
    ["• Relationship_Map: Which sellers work with which accounts"],
    ["• Manager_Team: Which sellers report to which managers"],
    [""],
    ["REQUIRED FIELDS:"],
    ["• Accounts: account_name, size, current_division"],
    ["• Sellers: seller_name, division, size, hire_date, book_finalized (optional)"],
    ["• Managers: manager_name, manager_email"],
    ["• Relationship_Map: account_name, seller_name, status"],
    ["• Manager_Team: manager_name, seller_name, is_primary (optional)"],
    [""],
    ["VALID VALUES:"],
    ["• size: 'enterprise' or 'midmarket'"],
    ["• division/current_division: 'ESG', 'GDT', 'GVC', 'MSG_US'"],
    ["• status: 'original', 'must_keep', 'for_discussion', 'to_be_peeled'"],
    ["  - 'original': Baseline assignment stored ONLY in original_relationships (not in relationship_maps) - read-only in UI"],
    ["  - 'must_keep': Account must remain with this seller - stored in relationship_maps"],
    ["  - 'for_discussion': Account assignment needs to be discussed - stored in relationship_maps"],
    ["  - 'to_be_peeled': Account should be reassigned to another seller - stored in relationship_maps"],
    [""],
    ["IMPORTANT NOTES:"],
    ["• Manager emails must match existing user profiles"],
    ["• Account and seller names must match exactly between tabs"],
    ["• Use ISO country codes (e.g., 'US', 'CA', 'GB') or 'N/A' for no data - see Country_Reference tab"],
    ["• Use state codes (e.g., 'CA', 'NY', 'TX') or 'N/A' for no data - see State_Reference tab"],
    ["• Use hire_date in MM/DD/YY format (e.g., '01/15/22') - tenure_months calculated automatically"],
    ["• Use seniority_type: 'junior' or 'senior' - determines revenue targets and account limits"],
    ["• is_primary: TRUE for primary manager, FALSE for secondary managers (defaults to TRUE if not specified)"],
    ["• book_finalized: TRUE or FALSE - indicates if seller's book is finalized (defaults to FALSE if not specified)"],
    ["• Latitude/longitude will be automatically mapped from country/state codes"]
  ];
  
  const instructionsWs = XLSX.utils.json_to_sheet(instructionsData);
  XLSX.utils.book_append_sheet(wb, instructionsWs, "Instructions");
  
  // Add Country and State Reference tabs
  const countryReferenceData = getCountryReferenceData();
  const countryWs = XLSX.utils.json_to_sheet(countryReferenceData);
  XLSX.utils.book_append_sheet(wb, countryWs, "Country_Reference");
  
  const stateReferenceData = getStateReferenceData();
  const stateWs = XLSX.utils.json_to_sheet(stateReferenceData);
  XLSX.utils.book_append_sheet(wb, stateWs, "State_Reference");
  
  // Generate and download file
  XLSX.writeFile(wb, "BAIN_Data_Import_Template.xlsx");
}

// ========== Comprehensive Import Function ==========

export async function importComprehensiveData(file: File, userId?: string, onProgress?: ImportProgressCallback) {
  // Initialize debugging
  currentDebugInfo = createDebugInfo();
  const debugStartTime = Date.now();
  
  // Acquire import lock to prevent concurrent materialized view refreshes
  try {
    const { data: lockAcquired, error } = await supabase.rpc('acquire_import_lock', {
      user_id: userId || '',
      duration_minutes: 30
    });
    
    if (error) {
      console.log('Could not acquire import lock:', error);
    } else if (lockAcquired) {
      onProgress?.("🔒 Import lock acquired - preventing concurrent refreshes");
    } else {
      onProgress?.("⚠️ Could not acquire import lock - other import may be running");
    }
  } catch (error) {
    console.log('Could not acquire import lock:', error);
  }
  
  onProgress?.("🚀 Starting Comprehensive Data Import");
  onProgress?.(`📁 File: ${file.name}, Size: ${file.size} bytes`);
  onProgress?.(`👤 User ID: ${userId}`);
  onProgress?.(`⏰ Start Time: ${new Date().toISOString()}`);
  
  // Debug: File reading step
  const fileReadStep = startStep("File Reading", undefined);
  logMemoryUsage();
  
  const wb = await readSheet(file);
  endStep(fileReadStep, 0);
  
  onProgress?.(`📊 Available sheets: ${wb.SheetNames.join(', ')}`);
  onProgress?.(`📋 Sheet count: ${wb.SheetNames.length}`);
  
  const results = {
    accounts: { imported: 0, errors: [] as string[] },
    sellers: { imported: 0, errors: [] as string[] },
    managers: { imported: 0, errors: [] as string[] },
    relationships: { imported: 0, errors: [] as string[] },
    managerTeams: { imported: 0, errors: [] as string[] }
  };
  
  try {
    // 1. Import Managers first (required for sellers)
    if (wb.SheetNames.includes("Managers")) {
      const managersStep = startStep("Managers Import", undefined);
      logConnectionPoolStatus("Starting managers import");
      logMemoryUsage();
      
      try {
        onProgress?.("🗑️ Truncating managers table...");
        const truncateStart = Date.now();
        
        // Truncate managers table first
        const { error: truncateError } = await supabase
          .from("managers")
          .delete()
          .neq("id", "00000000-0000-0000-0000-000000000000"); // Delete all records
        
        const truncateDuration = Date.now() - truncateStart;
        onProgress?.(`⏱️ Truncate completed in ${truncateDuration}ms`);
        
        if (truncateError) {
          throw new Error(`Failed to truncate managers table: ${truncateError.message}`);
        }

        onProgress?.("📊 Processing managers data...");
        const managersData = sheetToJson<ManagerRow>(wb, "Managers");
        onProgress?.(`📋 Found ${managersData.length} managers to import`);
        
        if (managersData.length > 0) {
          onProgress?.("📁 Creating temporary file for managers...");
          const tempFileStart = Date.now();
          
          // Create a temporary file for managers import
          const tempWb = XLSX.utils.book_new();
          const tempWs = XLSX.utils.json_to_sheet(managersData);
          XLSX.utils.book_append_sheet(tempWb, tempWs, "Managers");
          const tempFile = new File([XLSX.write(tempWb, { bookType: 'xlsx', type: 'array' })], "temp_managers.xlsx");
          
          const tempFileDuration = Date.now() - tempFileStart;
          onProgress?.(`⏱️ Temp file created in ${tempFileDuration}ms`);
          
          onProgress?.("💾 Importing managers to database...");
          const importStart = Date.now();
          
          await importManagers(tempFile, userId);
          results.managers.imported = managersData.length;
          
          const importDuration = Date.now() - importStart;
          onProgress?.(`⏱️ Database import completed in ${importDuration}ms`);
          
          endStep(managersStep, managersData.length);
          onProgress?.(`✅ Managers: ${managersData.length} imported successfully`);
        } else {
          onProgress?.("⚠️ No manager data found in Managers sheet");
          endStep(managersStep, 0);
        }
      } catch (error) {
        const errorMsg = `Manager import failed: ${error}`;
        results.managers.errors.push(errorMsg);
        logError(errorMsg, "Managers Import");
        endStep(managersStep, 0, [errorMsg]);
        onProgress?.(`❌ Managers import failed: ${error}`);
      }
    } else {
      onProgress?.("⚠️ No Managers sheet found in Excel file");
    }
    
    // 2. Import Accounts
    if (wb.SheetNames.includes("Accounts")) {
      const accountsStep = startStep("Accounts Import", undefined);
      logConnectionPoolStatus("Starting accounts import");
      logMemoryUsage();
      
      try {
        // Skip index dropping - the real bottleneck was concurrent processes, not indexes
        onProgress?.("⚡ Skipping account index optimization - process management is the key");

        onProgress?.("🗑️ Truncating accounts and revenues tables...");
        const truncateStart = Date.now();
        
        // Delete account_revenues first (foreign key constraint)
        const { error: revenueTruncateError } = await supabase
          .from("account_revenues")
          .delete()
          .neq("account_id", "00000000-0000-0000-0000-000000000000");
        
        if (revenueTruncateError) {
          throw new Error(`Failed to truncate account_revenues table: ${revenueTruncateError.message}`);
        }
        
        // Delete accounts
        const { error: accountTruncateError } = await supabase
          .from("accounts")
          .delete()
          .neq("id", "00000000-0000-0000-0000-000000000000");
        
        if (accountTruncateError) {
          throw new Error(`Failed to truncate accounts table: ${accountTruncateError.message}`);
        }
        
        // Truncate relationship tables to prevent conflicts
        onProgress?.("🗑️ Truncating relationship tables...");
        const { error: relationshipTruncateError } = await supabase
          .from("relationship_maps")
          .delete()
          .neq("account_id", "00000000-0000-0000-0000-000000000000");
        
        if (relationshipTruncateError) {
          throw new Error(`Failed to truncate relationship_maps table: ${relationshipTruncateError.message}`);
        }
        
        const { error: originalRelationshipTruncateError } = await supabase
          .from("original_relationships")
          .delete()
          .neq("account_id", "00000000-0000-0000-0000-000000000000");
        
        if (originalRelationshipTruncateError) {
          throw new Error(`Failed to truncate original_relationships table: ${originalRelationshipTruncateError.message}`);
        }
        
        const truncateDuration = Date.now() - truncateStart;
        onProgress?.(`⏱️ Truncate completed in ${truncateDuration}ms`);

        onProgress?.("📊 Processing accounts data...");
        const accountsData = sheetToJson<AccountRow>(wb, "Accounts");
        onProgress?.(`📋 Found ${accountsData.length} accounts to import`);
        
        if (accountsData.length > 0) {
          onProgress?.("📁 Creating temporary file for accounts...");
          const tempFileStart = Date.now();
          
          const tempWb = XLSX.utils.book_new();
          const tempWs = XLSX.utils.json_to_sheet(accountsData);
          XLSX.utils.book_append_sheet(tempWb, tempWs, "Accounts");
          const tempFile = new File([XLSX.write(tempWb, { bookType: 'xlsx', type: 'array' })], "temp_accounts.xlsx");
          
          const tempFileDuration = Date.now() - tempFileStart;
          onProgress?.(`⏱️ Temp file created in ${tempFileDuration}ms`);
          
          onProgress?.("💾 Importing accounts to database...");
          const importStart = Date.now();
          
          await importAccounts(tempFile, userId);
          results.accounts.imported = accountsData.length;
          
          const importDuration = Date.now() - importStart;
          onProgress?.(`⏱️ Database import completed in ${importDuration}ms`);
          
          // Skip index recreation - indexes are kept for query performance
          onProgress?.("⚡ Keeping account indexes for optimal query performance");
          
          endStep(accountsStep, accountsData.length);
          onProgress?.(`✅ Accounts: ${accountsData.length} imported successfully`);
        } else {
          onProgress?.("⚠️ No account data found in Accounts sheet");
          endStep(accountsStep, 0);
        }
      } catch (error) {
        const errorMsg = `Account import failed: ${error}`;
        results.accounts.errors.push(errorMsg);
        logError(errorMsg, "Accounts Import");
        endStep(accountsStep, 0, [errorMsg]);
        onProgress?.(`❌ Accounts import failed: ${error}`);
      }
    } else {
      onProgress?.("⚠️ No Accounts sheet found in Excel file");
    }
    
    // 3. Import Sellers
    if (wb.SheetNames.includes("Sellers")) {
      try {
        // BACKUP: Save chat messages before truncating sellers (CASCADE DELETE will remove them)
        onProgress?.("💬 Backing up chat messages before seller truncation...");
        const chatBackupStart = Date.now();
        
        const { data: chatMessages, error: chatBackupError } = await (supabase as any)
          .from('seller_chat_messages')
          .select(`
            id,
            seller_id,
            user_id,
            content,
            role,
            created_at,
            updated_at,
            sellers!inner(name)
          `);
        
        if (chatBackupError) {
          onProgress?.(`⚠️ Warning: Could not backup chat messages: ${chatBackupError.message}`);
        } else {
          const chatBackupDuration = Date.now() - chatBackupStart;
          onProgress?.(`💾 Chat backup completed in ${chatBackupDuration}ms - ${chatMessages?.length || 0} messages backed up`);
        }

        // Truncate sellers table first (this will CASCADE DELETE chat messages)
        onProgress?.("🗑️ Truncating sellers table (chat messages will be temporarily removed)...");
        const { error: truncateError } = await supabase
          .from("sellers")
          .delete()
          .neq("id", "00000000-0000-0000-0000-000000000000");
        
        if (truncateError) {
          throw new Error(`Failed to truncate sellers table: ${truncateError.message}`);
        }

        const sellersData = sheetToJson<SellerRow>(wb, "Sellers");
        
        if (sellersData.length > 0) {
          const tempWb = XLSX.utils.book_new();
          const tempWs = XLSX.utils.json_to_sheet(sellersData);
          XLSX.utils.book_append_sheet(tempWb, tempWs, "Sellers");
          const tempFile = new File([XLSX.write(tempWb, { bookType: 'xlsx', type: 'array' })], "temp_sellers.xlsx");
          
          await importSellers(tempFile, userId);
          results.sellers.imported = sellersData.length;
          
          // RESTORE: Restore chat messages after sellers are imported
          if (chatMessages && chatMessages.length > 0) {
            onProgress?.("💬 Restoring chat messages after seller import...");
            const chatRestoreStart = Date.now();
            
            let restoredCount = 0;
            let failedCount = 0;
            
            for (const chat of chatMessages) {
              try {
                // Find the new seller by name
                const { data: newSeller, error: sellerLookupError } = await supabase
                  .from('sellers')
                  .select('id')
                  .eq('name', chat.sellers.name)
                  .single();
                
                if (sellerLookupError || !newSeller) {
                  onProgress?.(`⚠️ Could not find seller "${chat.sellers.name}" for chat message restoration`);
                  failedCount++;
                  continue;
                }
                
                // Restore the chat message with the new seller_id
                const { error: restoreError } = await (supabase as any)
                  .from('seller_chat_messages')
                  .insert({
                    seller_id: newSeller.id, // New seller ID
                    user_id: chat.user_id,   // Same user ID
                    content: chat.content,   // Same content
                    role: chat.role,         // Same role
                    created_at: chat.created_at, // Preserve original timestamp
                    updated_at: chat.updated_at  // Preserve original timestamp
                    // id will be auto-generated
                  });
                
                if (restoreError) {
                  onProgress?.(`⚠️ Failed to restore chat message for "${chat.sellers.name}": ${restoreError.message}`);
                  failedCount++;
                } else {
                  restoredCount++;
                }
              } catch (error) {
                onProgress?.(`⚠️ Error restoring chat message for "${chat.sellers.name}": ${error}`);
                failedCount++;
              }
            }
            
            const chatRestoreDuration = Date.now() - chatRestoreStart;
            onProgress?.(`✅ Chat restore completed in ${chatRestoreDuration}ms - ${restoredCount} restored, ${failedCount} failed`);
          }
        } else {
        }
      } catch (error) {
        results.sellers.errors.push(`Seller import failed: ${error}`);
      }
    } else {
    }
    
    // 4. Import Relationship Map
    if (wb.SheetNames.includes("Relationship_Map")) {
      try {
        // Truncate relationship_maps and original_relationships tables first
        
        // Delete original_relationships first (foreign key constraint)
        const { error: originalTruncateError } = await supabase
          .from("original_relationships")
          .delete()
          .neq("account_id", "00000000-0000-0000-0000-000000000000");
        
        if (originalTruncateError) {
          throw new Error(`Failed to truncate original_relationships table: ${originalTruncateError.message}`);
        }
        
        // Delete relationship_maps
        const { error: relationshipTruncateError } = await supabase
          .from("relationship_maps")
          .delete()
          .neq("account_id", "00000000-0000-0000-0000-000000000000");
        
        if (relationshipTruncateError) {
          throw new Error(`Failed to truncate relationship_maps table: ${relationshipTruncateError.message}`);
        }
        
        // Skip index dropping - the real bottleneck was concurrent processes, not indexes
        onProgress?.("⚡ Skipping index optimization - process management is the key");

        const relationshipData = sheetToJson<RelRow>(wb, "Relationship_Map");
        
        if (relationshipData.length > 0) {
          // Direct bulk insert without batch processing (indexes already dropped)
          onProgress?.("🚀 Performing optimized bulk insert (indexes dropped)...");
          
          try {
            // Use the existing optimized import function but with bulk processing
            onProgress?.(`📊 Processing ${relationshipData.length} relationships with bulk insert...`);
            
            // Call the existing optimized function but ensure it uses bulk processing
            const relationshipResult = await importRelationshipMapAdd(relationshipData, userId);
            results.relationships.imported = relationshipResult.imported;
            results.relationships.errors.push(...relationshipResult.errors);
            
            onProgress?.(`✅ Relationships processed: ${relationshipResult.imported} imported, ${relationshipResult.errors.length} errors`);

          } catch (error) {
            results.relationships.errors.push(`Bulk relationship import failed: ${error}`);
            onProgress?.(`❌ Relationship import failed: ${error}`);
          }
          
          // Skip index recreation - indexes are kept for query performance
          onProgress?.("⚡ Keeping indexes for optimal query performance");
        } else {
        }
      } catch (error) {
        results.relationships.errors.push(`Relationship import failed: ${error}`);
      }
    } else {
    }
    
    // 5. Import Manager Teams
    if (wb.SheetNames.includes("Manager_Team")) {
      try {
        // Reset all seller manager_id fields to null first
        const { error: resetError } = await supabase
          .from("sellers")
          .update({ manager_id: null })
          .not("manager_id", "is", null);
        
        if (resetError) {
          throw new Error(`Failed to reset seller manager assignments: ${resetError.message}`);
        }

        const managerTeamData = sheetToJson<ManagerTeamRow>(wb, "Manager_Team");
        
        if (managerTeamData.length > 0) {
          const tempWb = XLSX.utils.book_new();
          const tempWs = XLSX.utils.json_to_sheet(managerTeamData);
          XLSX.utils.book_append_sheet(tempWb, tempWs, "ManagerTeam");
          const tempFile = new File([XLSX.write(tempWb, { bookType: 'xlsx', type: 'array' })], "temp_manager_teams.xlsx");
          
          await importManagerTeam(tempFile, userId);
          results.managerTeams.imported = managerTeamData.length;
        } else {
        }
      } catch (error) {
        results.managerTeams.errors.push(`Manager team import failed: ${error}`);
      }
    } else {
    }
    
    // Release import lock first so materialized views can refresh
    try {
      const { data: lockReleased, error } = await supabase.rpc('release_import_lock', {
        user_id: userId || ''
      });

      if (error) {
        console.log('Could not release import lock:', error);
      } else if (lockReleased) {
        onProgress?.("🔓 Import lock released - allowing materialized view refresh");
      }
    } catch (error) {
      console.log('Could not release import lock:', error);
    }

    // Refresh materialized views to update dashboard data (now that lock is released)
    const refreshStep = startStep("Refresh Materialized Views", undefined);
    logConnectionPoolStatus("Refreshing materialized views");
    
    try {
      onProgress?.("🔄 Refreshing materialized views...");
      const refreshStart = Date.now();
      
      // Use simple refresh function without CONCURRENTLY to avoid index requirements
      await supabase.rpc('refresh_performance_views_simple');
      
      const refreshDuration = Date.now() - refreshStart;
      onProgress?.(`⏱️ Views refreshed in ${refreshDuration}ms`);
      endStep(refreshStep, 0);
      onProgress?.("✅ Materialized views refreshed successfully");
    } catch (refreshError) {
      const errorMsg = `Error refreshing materialized views: ${refreshError}`;
      logError(errorMsg, "Refresh Views");
      endStep(refreshStep, 0, [errorMsg]);
      onProgress?.(`⚠️ Warning: ${errorMsg}`);
      // Don't fail the import if refresh fails
    }

    // Log comprehensive audit event
    const auditStep = startStep("Log Audit Event", undefined);
    if (userId) {
      try {
        onProgress?.("📝 Logging audit event...");
        const auditStart = Date.now();
        
        const auditData = createAuditLogData(
          userId,
          'data_import',
          'COMPREHENSIVE',
          undefined,
          null,
          {
            import_type: 'comprehensive',
            file_name: file.name,
            file_size: file.size,
            results: results
          }
        );
        
        await logAuditEvent(auditData);
        
        const auditDuration = Date.now() - auditStart;
        onProgress?.(`⏱️ Audit logged in ${auditDuration}ms`);
        endStep(auditStep, 0);
      } catch (auditError) {
        const errorMsg = `Error logging audit: ${auditError}`;
        logError(errorMsg, "Audit Logging");
        endStep(auditStep, 0, [errorMsg]);
        onProgress?.(`⚠️ Warning: ${errorMsg}`);
      }
    }
    
    // Final summary and debug info
    const totalImported = Object.values(results).reduce((sum: number, result: any) => sum + result.imported, 0);
    const totalErrors = Object.values(results).reduce((sum: number, result: any) => sum + result.errors.length, 0);
    
    // Finalize debug info and log comprehensive summary
    const debugInfo = finalizeDebugInfo();
    if (debugInfo) {
      onProgress?.(`🔍 DEBUG SUMMARY:`);
      onProgress?.(`⏱️ Total Duration: ${debugInfo.totalDuration || 0}ms (${((debugInfo.totalDuration || 0) / 1000).toFixed(2)}s)`);
      onProgress?.(`📊 Steps Completed: ${debugInfo.steps.length}`);
      onProgress?.(`🔗 Connection Pool Events: ${debugInfo.connectionPoolHistory.length}`);
      onProgress?.(`💾 Memory Events: ${debugInfo.memoryHistory.length}`);
      onProgress?.(`❌ Error Events: ${debugInfo.errorHistory.length}`);
      
      // Log step-by-step breakdown
      debugInfo.steps.forEach(step => {
        onProgress?.(`  📋 ${step.step}: ${step.duration}ms (${step.recordsProcessed || 0} records)`);
      });
    }
    
    if (totalErrors > 0) {
      onProgress?.(`⚠️ Import completed with ${totalErrors} errors:`);
      Object.entries(results).forEach(([key, result]: [string, any]) => {
        if (result.errors.length > 0) {
          onProgress?.(`  ❌ ${key}: ${result.errors.length} errors`);
          result.errors.forEach((error: any) => {
            const errorMessage = typeof error === 'string' ? error : 
              error?.message || error?.error || JSON.stringify(error);
            onProgress?.(`    - ${errorMessage}`);
          });
        }
      });
    }
    
    onProgress?.(`✅ Import completed: ${totalImported} records imported, ${totalErrors} errors`);
    
    // Invalidate queries to refresh dashboard data
    try {
      // Trigger a custom event to notify components to refresh
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('import-completed', {
          detail: { 
            totalImported, 
            totalErrors,
            timestamp: Date.now()
          }
        }));
      }
      
      onProgress?.("🔄 Dashboard refresh event triggered");
    } catch (error) {
      console.log('Could not trigger refresh event:', error);
    }
    
    // Import lock already released before materialized view refresh
    
    return results;
    
  } catch (error) {
    // Trigger refresh event even on error
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('import-completed', {
          detail: { 
            totalImported: 0, 
            totalErrors: 1,
            timestamp: Date.now(),
            error: true
          }
        }));
      }
      console.log('🔄 Dashboard refresh event triggered after error');
    } catch (invalidateError) {
      console.log('Could not trigger refresh event on error:', invalidateError);
    }
    
    // Release import lock even on error
    try {
      const { data: lockReleased, error } = await supabase.rpc('release_import_lock', {
        user_id: userId || ''
      });
      
      if (error) {
        console.log('Could not release import lock on error:', error);
      } else if (lockReleased) {
        console.log('🔓 Import lock released after error');
      }
    } catch (clearError) {
      console.log('Could not release import lock on error:', clearError);
    }
    throw error;
  }
}

// ========== EXPORT FUNCTIONS ==========

/**
 * Export comprehensive data with all tables (like replace mode template)
 * This exports all data tables in separate sheets, matching the comprehensive import template structure
 */
export async function exportComprehensiveData() {
  try {
    const wb = XLSX.utils.book_new();
    
    // 1. EXPORT ACCOUNTS TABLE
    console.log('Exporting accounts table...');
    const accountsData = await exportAccountsTable();
    console.log('Accounts data:', accountsData?.length || 0, 'records');
    if (accountsData && accountsData.length > 0) {
      const accountsWs = XLSX.utils.json_to_sheet(accountsData);
      XLSX.utils.book_append_sheet(wb, accountsWs, "Accounts");
    }
    
    // 2. EXPORT SELLERS TABLE
    console.log('Exporting sellers table...');
    const sellersData = await exportSellersTable();
    console.log('Sellers data:', sellersData?.length || 0, 'records');
    if (sellersData && sellersData.length > 0) {
      const sellersWs = XLSX.utils.json_to_sheet(sellersData);
      XLSX.utils.book_append_sheet(wb, sellersWs, "Sellers");
    }
    
    // 3. EXPORT MANAGERS TABLE
    console.log('Exporting managers table...');
    const managersData = await exportManagersTable();
    console.log('Managers data:', managersData?.length || 0, 'records');
    if (managersData && managersData.length > 0) {
      const managersWs = XLSX.utils.json_to_sheet(managersData);
      XLSX.utils.book_append_sheet(wb, managersWs, "Managers");
    }
    
    // 4. EXPORT RELATIONSHIP_MAP TABLE
    console.log('Exporting relationship map table...');
    const relationshipData = await exportRelationshipMapTable();
    console.log('Relationship data:', relationshipData?.length || 0, 'records');
    if (relationshipData && relationshipData.length > 0) {
      const relationshipWs = XLSX.utils.json_to_sheet(relationshipData);
      XLSX.utils.book_append_sheet(wb, relationshipWs, "Relationship_Map");
    }
    
    // 5. EXPORT MANAGER_TEAM TABLE
    console.log('Exporting manager team table...');
    const managerTeamData = await exportManagerTeamTable();
    console.log('Manager team data:', managerTeamData?.length || 0, 'records');
    if (managerTeamData && managerTeamData.length > 0) {
      const managerTeamWs = XLSX.utils.json_to_sheet(managerTeamData);
      XLSX.utils.book_append_sheet(wb, managerTeamWs, "Manager_Team");
    }

    // 6. EXPORT ORIGINAL RELATIONSHIPS TABLE
    console.log('Exporting original relationships table...');
    const originalRelationshipsData = await exportOriginalRelationshipsTable();
    console.log('Original relationships data:', originalRelationshipsData?.length || 0, 'records');
    if (originalRelationshipsData && originalRelationshipsData.length > 0) {
      const originalRelationshipsWs = XLSX.utils.json_to_sheet(originalRelationshipsData);
      XLSX.utils.book_append_sheet(wb, originalRelationshipsWs, "Original_Relationships");
    }

    // 7. EXPORT CHAT MESSAGES TABLE
    console.log('Exporting chat messages table...');
    const chatMessagesData = await exportChatMessagesTable();
    console.log('Chat messages data:', chatMessagesData?.length || 0, 'records');
    if (chatMessagesData && chatMessagesData.length > 0) {
      const chatMessagesWs = XLSX.utils.json_to_sheet(chatMessagesData);
      XLSX.utils.book_append_sheet(wb, chatMessagesWs, "Chat_Messages");
    }
    
    // 8. ADD REFERENCE TABLES
    const countryReferenceData = getCountryReferenceData();
    const countryWs = XLSX.utils.json_to_sheet(countryReferenceData);
    XLSX.utils.book_append_sheet(wb, countryWs, "Country_Reference");
    
    const stateReferenceData = getStateReferenceData();
    const stateWs = XLSX.utils.json_to_sheet(stateReferenceData);
    XLSX.utils.book_append_sheet(wb, stateWs, "State_Reference");
    
    // 7. ADD INSTRUCTIONS TAB
    const instructionsData = [
      ["BAIN DATA EXPORT - INSTRUCTIONS"],
      [""],
      ["This export contains all data tables from your system:"],
      [""],
      ["• Accounts: All account records with revenue data"],
      ["• Sellers: All seller records with manager assignments"],
      ["• Managers: All manager records"],
      ["• Relationship_Map: Account-seller relationships with status"],
      ["• Manager_Team: Manager-seller team assignments"],
      [""],
      ["FIELD DESCRIPTIONS:"],
      [""],
      ["ACCOUNTS:"],
      ["• account_name: Company name"],
      ["• industry: Business industry"],
      ["• size: 'enterprise' or 'midmarket'"],
      ["• tier: Account tier level"],
      ["• type: Account type classification"],
      ["• state: US state code"],
      ["• city: City name"],
      ["• country: ISO country code"],
      ["• current_division: 'ESG', 'GDT', 'GVC', 'MSG_US'"],
      ["• revenue_ESG/GDT/GVC/MSG_US: Revenue by division"],
      [""],
      ["SELLERS:"],
      ["• seller_name: Seller full name"],
      ["• division: 'ESG', 'GDT', 'GVC', 'MSG_US'"],
      ["• size: 'enterprise' or 'midmarket'"],
      ["• industry_specialty: Specialized industry"],
      ["• state: US state code"],
      ["• city: City name"],
      ["• country: ISO country code"],
      ["• manager_email: Manager's email address"],
      ["• tenure_months: Number of months with company"],
      ["• seniority_type: 'junior' or 'senior'"],
      ["• book_finalized: TRUE or FALSE"],
      [""],
      ["MANAGERS:"],
      ["• manager_name: Manager full name"],
      ["• manager_email: Manager's email address"],
      [""],
      ["RELATIONSHIP_MAP:"],
      ["• account_name: Must match Accounts table"],
      ["• seller_name: Must match Sellers table"],
      ["• status: 'original', 'must_keep', 'for_discussion', 'to_be_peeled'"],
      [""],
      ["MANAGER_TEAM:"],
      ["• manager_name: Must match Managers table"],
      ["• seller_name: Must match Sellers table"],
      ["• is_primary: TRUE or FALSE"],
      [""],
      ["ORIGINAL_RELATIONSHIPS:"],
      ["• account_name: Must match Accounts table"],
      ["• seller_name: Must match Sellers table"],
      ["• created_at: When the original relationship was created"],
      [""],
      ["CHAT_MESSAGES:"],
      ["• seller_name: Must match Sellers table"],
      ["• user_name: Name of the user who sent the message"],
      ["• user_email: Email of the user who sent the message"],
      ["• content: The message content"],
      ["• role: 'manager' or 'admin'"],
      ["• created_at: When the message was created"],
      ["• updated_at: When the message was last updated"],
      [""],
      ["IMPORTANT NOTES:"],
      ["• All names must match exactly between tables"],
      ["• Use ISO country codes (see Country_Reference tab)"],
      ["• Use state codes (see State_Reference tab)"],
      ["• Revenue values are in dollars"],
      ["• Tenure is in months (integer)"]
    ];
    
    const instructionsWs = XLSX.utils.json_to_sheet(instructionsData);
    XLSX.utils.book_append_sheet(wb, instructionsWs, "Instructions");
    
    // Generate Excel file
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    
    // Create blob and download
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Complete_Data_Export_${new Date().toISOString().split('T')[0]}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    
    return { exported: 'all_tables', filename: link.download };
    
  } catch (error) {
    throw error;
  }
}

/**
 * Export accounts table with all fields
 */
async function exportAccountsTable() {
  try {
    let allAccounts: any[] = [];
    let from = 0;
    const limit = 1000;
    let hasMore = true;
    
    while (hasMore) {
      const { data: accountsBatch, error } = await supabase
        .from('accounts')
        .select(`
          name,
          industry,
          size,
          tier,
          type,
          state,
          city,
          country,
          current_division,
          account_revenues (
            revenue_esg,
            revenue_gdt,
            revenue_gvc,
            revenue_msg_us
          )
        `)
        .range(from, from + limit - 1)
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`Failed to fetch accounts: ${error.message}`);
      }

      if (accountsBatch && accountsBatch.length > 0) {
        allAccounts = allAccounts.concat(accountsBatch);
        from += limit;
      } else {
        hasMore = false;
      }
    }

    return allAccounts.map((account: any) => {
      const revenue = account.account_revenues;
      return {
        account_name: account.name,
        industry: account.industry,
        size: account.size,
        tier: account.tier,
        type: account.type,
        state: account.state,
        city: account.city,
        country: account.country,
        current_division: account.current_division,
        revenue_ESG: revenue?.revenue_esg || 0,
        revenue_GDT: revenue?.revenue_gdt || 0,
        revenue_GVC: revenue?.revenue_gvc || 0,
        revenue_MSG_US: revenue?.revenue_msg_us || 0
      };
    });
  } catch (error) {
    console.error('Error exporting accounts:', error);
    return [];
  }
}

/**
 * Export sellers table with all fields
 */
async function exportSellersTable() {
  try {
    console.log('Starting sellers export...');
    let allSellers: any[] = [];
    let from = 0;
    const limit = 1000;
    let hasMore = true;
    
    while (hasMore) {
      console.log(`Fetching sellers batch from ${from} to ${from + limit - 1}`);
      const { data: sellersBatch, error } = await supabase
        .from('sellers')
        .select(`
          name,
          division,
          size,
          industry_specialty,
          state,
          city,
          country,
          manager_id,
          tenure_months,
          seniority_type,
          book_finalized,
          managers (
            user_id,
            profiles (
              email
            )
          )
        `)
        .range(from, from + limit - 1)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching sellers:', error);
        throw new Error(`Failed to fetch sellers: ${error.message}`);
      }

      console.log(`Fetched ${sellersBatch?.length || 0} sellers in this batch`);
      if (sellersBatch && sellersBatch.length > 0) {
        allSellers = allSellers.concat(sellersBatch);
        from += limit;
      } else {
        hasMore = false;
      }
    }

    console.log(`Total sellers fetched: ${allSellers.length}`);
    const result = allSellers.map((seller: any) => {
      const manager = seller.managers;
      return {
        seller_name: seller.name,
        division: seller.division,
        size: seller.size,
        industry_specialty: seller.industry_specialty,
        state: seller.state,
        city: seller.city,
        country: seller.country,
        manager_email: manager?.profiles?.email || '',
        tenure_months: seller.tenure_months,
        seniority_type: seller.seniority_type,
        book_finalized: seller.book_finalized
      };
    });
    console.log(`Mapped ${result.length} sellers for export`);
    return result;
  } catch (error) {
    console.error('Error exporting sellers:', error);
    return [];
  }
}

/**
 * Export managers table with all fields
 */
async function exportManagersTable() {
  try {
    console.log('Starting managers export...');
    let allManagers: any[] = [];
    let from = 0;
    const limit = 1000;
    let hasMore = true;
    
    while (hasMore) {
      console.log(`Fetching managers batch from ${from} to ${from + limit - 1}`);
      const { data: managersBatch, error } = await supabase
        .from('managers')
        .select(`
          name,
          user_id,
          profiles (
            email
          )
        `)
        .range(from, from + limit - 1)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching managers:', error);
        throw new Error(`Failed to fetch managers: ${error.message}`);
      }

      console.log(`Fetched ${managersBatch?.length || 0} managers in this batch`);
      if (managersBatch && managersBatch.length > 0) {
        allManagers = allManagers.concat(managersBatch);
        from += limit;
      } else {
        hasMore = false;
      }
    }

    console.log(`Total managers fetched: ${allManagers.length}`);
    const result = allManagers.map((manager: any) => ({
      manager_name: manager.name,
      manager_email: manager.profiles?.email || ''
    }));
    console.log(`Mapped ${result.length} managers for export`);
    return result;
  } catch (error) {
    console.error('Error exporting managers:', error);
    return [];
  }
}

/**
 * Export relationship map table
 */
async function exportRelationshipMapTable() {
  try {
    console.log('Starting relationship map export...');
    let allRelationships: any[] = [];
    let from = 0;
    const limit = 1000;
    let hasMore = true;
    
    while (hasMore) {
      console.log(`Fetching relationships batch from ${from} to ${from + limit - 1}`);
      const { data: relationshipsBatch, error } = await supabase
        .from('relationship_maps')
        .select(`
          status,
          accounts (
            name
          ),
          sellers (
            name
          )
        `)
        .range(from, from + limit - 1)
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('Error fetching relationships:', error);
        throw new Error(`Failed to fetch relationships: ${error.message}`);
      }

      console.log(`Fetched ${relationshipsBatch?.length || 0} relationships in this batch`);
      if (relationshipsBatch && relationshipsBatch.length > 0) {
        allRelationships = allRelationships.concat(relationshipsBatch);
        from += limit;
      } else {
        hasMore = false;
      }
    }

    console.log(`Total relationships fetched: ${allRelationships.length}`);
    const result = allRelationships.map((relationship: any) => ({
      account_name: relationship.accounts?.name || '',
      seller_name: relationship.sellers?.name || '',
      status: relationship.status
    }));
    console.log(`Mapped ${result.length} relationships for export`);
    return result;
  } catch (error) {
    console.error('Error exporting relationships:', error);
    return [];
  }
}

/**
 * Export manager team table
 */
async function exportManagerTeamTable() {
  try {
    console.log('Starting manager team export...');
    let allManagerTeams: any[] = [];
    let from = 0;
    const limit = 1000;
    let hasMore = true;
    
    while (hasMore) {
      console.log(`Fetching manager teams batch from ${from} to ${from + limit - 1}`);
      const { data: managerTeamsBatch, error } = await supabase
        .from('seller_managers')
        .select(`
          is_primary,
          managers (
            name
          ),
          sellers (
            name
          )
        `)
        .range(from, from + limit - 1)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching manager teams:', error);
        throw new Error(`Failed to fetch manager teams: ${error.message}`);
      }

      console.log(`Fetched ${managerTeamsBatch?.length || 0} manager teams in this batch`);
      if (managerTeamsBatch && managerTeamsBatch.length > 0) {
        allManagerTeams = allManagerTeams.concat(managerTeamsBatch);
        from += limit;
      } else {
        hasMore = false;
      }
    }

    console.log(`Total manager teams fetched: ${allManagerTeams.length}`);
    const result = allManagerTeams.map((team: any) => ({
      manager_name: team.managers?.name || '',
      seller_name: team.sellers?.name || '',
      is_primary: team.is_primary
    }));
    console.log(`Mapped ${result.length} manager teams for export`);
    return result;
  } catch (error) {
    console.error('Error exporting manager teams:', error);
    return [];
  }
}

/**
 * Export original relationships table
 */
async function exportOriginalRelationshipsTable() {
  try {
    console.log('Starting original relationships export...');
    let allOriginalRelationships: any[] = [];
    let from = 0;
    const limit = 1000;
    let hasMore = true;
    
    while (hasMore) {
      console.log(`Fetching original relationships batch from ${from} to ${from + limit - 1}`);
      const { data: originalRelationshipsBatch, error } = await supabase
        .from('original_relationships')
        .select(`
          created_at,
          accounts (
            name
          ),
          sellers (
            name
          )
        `)
        .range(from, from + limit - 1)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching original relationships:', error);
        throw new Error(`Failed to fetch original relationships: ${error.message}`);
      }

      console.log(`Fetched ${originalRelationshipsBatch?.length || 0} original relationships in this batch`);
      if (originalRelationshipsBatch && originalRelationshipsBatch.length > 0) {
        allOriginalRelationships = allOriginalRelationships.concat(originalRelationshipsBatch);
        from += limit;
      } else {
        hasMore = false;
      }
    }

    console.log(`Total original relationships fetched: ${allOriginalRelationships.length}`);
    const result = allOriginalRelationships.map((relationship: any) => ({
      account_name: relationship.accounts?.name || '',
      seller_name: relationship.sellers?.name || '',
      created_at: relationship.created_at
    }));
    console.log(`Mapped ${result.length} original relationships for export`);
    return result;
  } catch (error) {
    console.error('Error exporting original relationships:', error);
    return [];
  }
}

/**
 * Export chat messages table
 */
async function exportChatMessagesTable() {
  try {
    console.log('Starting chat messages export...');
    let allChatMessages: any[] = [];
    let from = 0;
    const limit = 1000;
    let hasMore = true;
    
    while (hasMore) {
      console.log(`Fetching chat messages batch from ${from} to ${from + limit - 1}`);
      // Use raw SQL since seller_chat_messages is not in TypeScript types
      const { data: chatMessagesBatch, error } = await supabase
        .from('seller_chat_messages' as any)
        .select(`
          user_id,
          content,
          role,
          created_at,
          updated_at,
          sellers (
            name
          )
        `)
        .range(from, from + limit - 1)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching chat messages:', error);
        throw new Error(`Failed to fetch chat messages: ${error.message}`);
      }

      console.log(`Fetched ${chatMessagesBatch?.length || 0} chat messages in this batch`);
      if (chatMessagesBatch && chatMessagesBatch.length > 0) {
        allChatMessages = allChatMessages.concat(chatMessagesBatch);
        from += limit;
      } else {
        hasMore = false;
      }
    }

    console.log(`Total chat messages fetched: ${allChatMessages.length}`);
    console.log('Sample chat message:', allChatMessages[0]); // Debug: show first message structure
    
    // Get user information separately since there's no direct relationship
    // Filter out messages with undefined user_id
    const validUserIds = Array.from(new Set(
      allChatMessages
        .map((msg: any) => msg.user_id)
        .filter((id: any) => id !== undefined && id !== null)
    ));
    
    console.log(`Found ${validUserIds.length} valid user IDs:`, validUserIds);
    
    let profileMap = new Map();
    if (validUserIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, email')
        .in('id', validUserIds);
      
      profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
    }
    
    const result = allChatMessages.map((message: any) => {
      const profile = message.user_id ? profileMap.get(message.user_id) : null;
      return {
        seller_name: message.sellers?.name || '',
        user_name: profile?.name || 'Unknown User',
        user_email: profile?.email || 'unknown@example.com',
        content: message.content,
        role: message.role,
        created_at: message.created_at,
        updated_at: message.updated_at
      };
    });
    console.log(`Mapped ${result.length} chat messages for export`);
    return result;
  } catch (error) {
    console.error('Error exporting chat messages:', error);
    return [];
  }
}

/**
 * Export complete accounts table with assigned sellers (all statuses)
 * This exports all account fields plus the assigned seller information for all relationship statuses
 * Includes accounts without assigned sellers (with blank seller/manager columns)
 */
export async function exportCompleteAccountsWithAssignedSellers() {
  try {
    
    // Get ALL accounts with pagination to handle 1000+ records
    let allAccounts: any[] = [];
    let from = 0;
    const limit = 1000;
    let hasMore = true;
    
    while (hasMore) {
      const { data: accountsBatch, error } = await supabase
        .from('accounts')
        .select(`
          id,
          name,
          city,
          country,
          current_division,
          industry,
          lat,
          lng,
          size,
          state,
          tier,
          type,
          created_at,
          account_revenues (
            revenue_esg,
            revenue_gdt,
            revenue_gvc,
            revenue_msg_us
          ),
          relationship_maps (
            seller_id,
            status,
            sellers (
              id,
              name,
              division,
              size,
              industry_specialty,
              city,
              state,
              country,
              manager_id,
              managers (
                id,
                name
              )
            )
          )
        `)
        .range(from, from + limit - 1)
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`Failed to fetch accounts: ${error.message}`);
      }

      if (accountsBatch && accountsBatch.length > 0) {
        allAccounts = allAccounts.concat(accountsBatch);
        from += limit;
      } else {
        hasMore = false;
      }
    }

    if (!allAccounts || allAccounts.length === 0) {
      return null;
    }


    // Transform the data into a flat structure for Excel export
    const exportData = allAccounts.map((account: any) => {
      // Get the first relationship (if any exists)
      const relationship = account.relationship_maps && account.relationship_maps.length > 0 ? account.relationship_maps[0] : null;
      const seller = relationship?.sellers;
      const manager = seller?.managers;
      const revenue = account.account_revenues;

      return {
        // Account fields
        account_id: account.id,
        account_name: account.name,
        account_city: account.city,
        account_country: account.country,
        account_current_division: account.current_division,
        account_industry: account.industry,
        account_lat: account.lat,
        account_lng: account.lng,
        account_size: account.size,
        account_state: account.state,
        account_tier: account.tier,
        account_type: account.type,
        account_created_at: account.created_at,
        
        // Revenue fields
        revenue_esg: revenue?.revenue_esg || 0,
        revenue_gdt: revenue?.revenue_gdt || 0,
        revenue_gvc: revenue?.revenue_gvc || 0,
        revenue_msg_us: revenue?.revenue_msg_us || 0,
        total_revenue: (revenue?.revenue_esg || 0) + (revenue?.revenue_gdt || 0) + (revenue?.revenue_gvc || 0) + (revenue?.revenue_msg_us || 0),
        
        // Assigned seller fields (blank if no assigned seller)
        assigned_seller_id: seller?.id || '',
        assigned_seller_name: seller?.name || '',
        assigned_seller_division: seller?.division || '',
        assigned_seller_size: seller?.size || '',
        assigned_seller_industry_specialty: seller?.industry_specialty || '',
        assigned_seller_city: seller?.city || '',
        assigned_seller_state: seller?.state || '',
        assigned_seller_country: seller?.country || '',
        assigned_seller_manager_id: seller?.manager_id || '',
        assigned_seller_manager_name: manager?.name || '',
        relationship_status: relationship?.status || ''
      };
    });

    // Create Excel workbook
    const wb = XLSX.utils.book_new();
    
    // Create worksheet
    const ws = XLSX.utils.json_to_sheet(exportData);
    
    // Set column widths for better readability
    const colWidths = [
      { wch: 36 }, // account_id
      { wch: 30 }, // account_name
      { wch: 15 }, // account_city
      { wch: 15 }, // account_country
      { wch: 15 }, // account_current_division
      { wch: 20 }, // account_industry
      { wch: 12 }, // account_lat
      { wch: 12 }, // account_lng
      { wch: 12 }, // account_size
      { wch: 15 }, // account_state
      { wch: 15 }, // account_tier
      { wch: 15 }, // account_type
      { wch: 20 }, // account_created_at
      { wch: 15 }, // revenue_esg
      { wch: 15 }, // revenue_gdt
      { wch: 15 }, // revenue_gvc
      { wch: 15 }, // revenue_msg_us
      { wch: 15 }, // total_revenue
      { wch: 36 }, // assigned_seller_id
      { wch: 25 }, // assigned_seller_name
      { wch: 15 }, // assigned_seller_division
      { wch: 15 }, // assigned_seller_size
      { wch: 20 }, // assigned_seller_industry_specialty
      { wch: 15 }, // assigned_seller_city
      { wch: 15 }, // assigned_seller_state
      { wch: 15 }, // assigned_seller_country
      { wch: 36 }, // assigned_seller_manager_id
      { wch: 25 }, // assigned_seller_manager_name
      { wch: 15 }  // relationship_status
    ];
    ws['!cols'] = colWidths;
    
    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, "Accounts_With_Assigned_Sellers");
    
    // Generate Excel file
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    
    // Create blob and download
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Complete_Accounts_With_Assigned_Sellers_${new Date().toISOString().split('T')[0]}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    
    return { exported: exportData.length, filename: link.download };
    
  } catch (error) {
    throw error;
  }
}
