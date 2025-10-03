import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { logAuditEvent, createAuditLogData, AUDIT_ACTIONS, AUDIT_ENTITIES } from "@/lib/audit";

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

  console.log(`📊 Total accounts found: ${accountsToUpsert.length}`);
  console.log(`📊 Unique accounts after deduplication: ${uniqueAccounts.length}`);
  
  if (accountsToUpsert.length !== uniqueAccounts.length) {
    console.log(`⚠️ Removed ${accountsToUpsert.length - uniqueAccounts.length} duplicate accounts`);
  }

  console.log(`Uploading ${uniqueAccounts.length} accounts in batches...`);

  // Batch upsert accounts
  const accountChunks = chunk(uniqueAccounts, BATCH_SIZE);
  const allAccounts: Array<{ id: string; name: string }> = [];

  for (let i = 0; i < accountChunks.length; i++) {
    console.log(`Processing accounts batch ${i + 1}/${accountChunks.length}...`);
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

  console.log(`📊 Total revenue records found: ${revenuesToUpsert.length}`);
  console.log(`📊 Unique revenue records after deduplication: ${uniqueRevenues.length}`);
  
  if (revenuesToUpsert.length !== uniqueRevenues.length) {
    console.log(`⚠️ Removed ${revenuesToUpsert.length - uniqueRevenues.length} duplicate revenue records`);
  }

  console.log(`Uploading ${uniqueRevenues.length} account revenues in batches...`);

  // Batch upsert revenues
  const revenueChunks = chunk(uniqueRevenues, BATCH_SIZE);

  for (let i = 0; i < revenueChunks.length; i++) {
    console.log(`Processing revenues batch ${i + 1}/${revenueChunks.length}...`);
    const { error } = await supabase
      .from("account_revenues")
      .upsert(revenueChunks[i], { onConflict: "account_id" });

    if (error) throw new Error(`Failed to upsert revenues batch ${i + 1}: ${error.message}`);
  }

  console.log(`✓ Successfully imported ${uniqueAccounts.length} accounts with ${uniqueRevenues.length} revenue records`);

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
  tenure_months?: number | null;
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
        tenure_months: r.tenure_months ?? null,
        manager_id: null, // Will be assigned via Manager_Team tab
      };
    });

  console.log(`Uploading ${sellersToUpsert.length} sellers in batches...`);

  // Batch upsert sellers
  const sellerChunks = chunk(sellersToUpsert, BATCH_SIZE);

  for (let i = 0; i < sellerChunks.length; i++) {
    console.log(`Processing sellers batch ${i + 1}/${sellerChunks.length}...`);
    const { error } = await supabase
      .from("sellers")
      .upsert(sellerChunks[i], { onConflict: "name" });

    if (error) throw new Error(`Failed to upsert sellers batch ${i + 1}: ${error.message}`);
  }

  console.log(`✓ Successfully imported ${sellersToUpsert.length} sellers`);

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
  }
}

// ========== RelationshipMap.xlsx ==========
type RelRow = {
  account_name: string;
  seller_name: string;
  status: "approval for pinning" | "pinned" | "approval for assigning" | "assigned" | "up for debate" | "peeled" | "available" | "must keep" | "for discussion" | "to be peeled" | "approval_for_pinning" | "approval_for_assigning" | "up_for_debate" | "must_keep" | "for_discussion" | "to_be_peeled";
};

const statusMap: Record<string, string> = {
  // User-friendly names (with spaces)
  "approval for pinning": "approval_for_pinning",
  "pinned": "pinned",
  "approval for assigning": "approval_for_assigning",
  "assigned": "assigned",
  "up for debate": "up_for_debate",
  "peeled": "peeled",
  "available": "available",
  "must keep": "must_keep",
  "for discussion": "for_discussion",
  "to be peeled": "to_be_peeled",
  
  // Database enum values (underscore format)
  "approval_for_pinning": "approval_for_pinning",
  "approval_for_assigning": "approval_for_assigning",
  "up_for_debate": "up_for_debate",
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
  console.log("Prefetching accounts, sellers, and profiles...");

  // Fetch all accounts with pagination to get all 7714+ records
  console.log("📥 Fetching all accounts with pagination...");
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
      console.log(`📥 Fetched ${data.length} accounts (total: ${allAccounts.length})`);
    } else {
      hasMore = false;
    }
    
    // Safety check to prevent infinite loop
    if (from > 10000) {
      console.warn("⚠️ Stopping pagination at 10,000 records to prevent infinite loop");
      break;
    }
  }
  
  console.log(`📊 Total accounts fetched: ${allAccounts.length}`);
  
  const [sellersRes, profilesRes] = await Promise.all([
    supabase.from("sellers").select("id,name"),
    supabase.from("profiles").select("id,email"),
  ]);

  if (sellersRes.error) throw new Error(`Failed to fetch sellers: ${sellersRes.error.message}`);
  if (profilesRes.error) throw new Error(`Failed to fetch profiles: ${profilesRes.error.message}`);

  console.log(`📊 Raw sellers fetched: ${sellersRes.data?.length || 0}`);
  
  // Debug: Check if Cannon account is in the raw data
  const cannonInRawData = allAccounts.find(a => a.name === "Cannon Instrument Company");
  console.log(`🔍 Debug: "Cannon Instrument Company" in raw accounts data: ${!!cannonInRawData}`);
  if (cannonInRawData) {
    console.log(`🔍 Debug: Raw Cannon account:`, cannonInRawData);
  }

  const accountMap = new Map(allAccounts.map(a => [a.name, a.id]));
  const sellerMap = new Map(sellersRes.data?.map(s => [s.name, s.id]) ?? []);
  const profileMap = new Map(profilesRes.data?.map(p => [p.email.toLowerCase(), p.id]) ?? []);

  console.log(`📊 Found ${accountMap.size} accounts and ${sellerMap.size} sellers for relationship mapping`);
  console.log("📋 Sample account names:", Array.from(accountMap.keys()).slice(0, 5));
  console.log("📋 Sample seller names:", Array.from(sellerMap.keys()).slice(0, 5));
  
  // Debug: Check if specific account exists
  const cannonAccount = accountMap.get("Cannon Instrument Company");
  console.log(`🔍 Debug: "Cannon Instrument Company" found in accountMap: ${!!cannonAccount}`);
  if (cannonAccount) {
    console.log(`🔍 Debug: "Cannon Instrument Company" ID: ${cannonAccount}`);
  }

  // Prepare relationship data
  const relationshipsToUpsert = rows
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
          console.log(`🔧 Fixed case mismatch: "${r.account_name}" → "${exactAccount}"`);
        }
      }
      
      if (!sellerId) {
        const exactSeller = Array.from(sellerMap.keys()).find(name => 
          name.toLowerCase() === r.seller_name.toLowerCase()
        );
        if (exactSeller) {
          sellerId = sellerMap.get(exactSeller);
          console.log(`🔧 Fixed case mismatch: "${r.seller_name}" → "${exactSeller}"`);
        }
      }

      if (!accountId || !sellerId) {
        console.warn(`⚠️ Skipping relationship: account "${r.account_name}" or seller "${r.seller_name}" not found`);
        console.warn(`🔍 Looking for account: "${r.account_name}" (found: ${!!accountId})`);
        console.warn(`🔍 Looking for seller: "${r.seller_name}" (found: ${!!sellerId})`);
        
        // Show similar names for debugging
        if (!accountId) {
          const similarAccounts = Array.from(accountMap.keys()).filter(name => 
            name.toLowerCase().includes(r.account_name.toLowerCase()) || 
            r.account_name.toLowerCase().includes(name.toLowerCase())
          );
          if (similarAccounts.length > 0) {
            console.warn(`💡 Similar account names found:`, similarAccounts.slice(0, 3));
          }
          
          // Check for exact match with different case
          const exactMatch = Array.from(accountMap.keys()).find(name => 
            name.toLowerCase() === r.account_name.toLowerCase()
          );
          if (exactMatch) {
            console.warn(`🔍 Case mismatch found! Looking for: "${r.account_name}" but found: "${exactMatch}"`);
          }
          
          // Check for extra spaces or characters
          const trimmedMatch = Array.from(accountMap.keys()).find(name => 
            name.trim().toLowerCase() === r.account_name.trim().toLowerCase()
          );
          if (trimmedMatch) {
            console.warn(`🔍 Whitespace mismatch found! Looking for: "${r.account_name}" but found: "${trimmedMatch}"`);
          }
        }
        
        if (!sellerId) {
          const similarSellers = Array.from(sellerMap.keys()).filter(name => 
            name.toLowerCase().includes(r.seller_name.toLowerCase()) || 
            r.seller_name.toLowerCase().includes(name.toLowerCase())
          );
          if (similarSellers.length > 0) {
            console.warn(`💡 Similar seller names found:`, similarSellers.slice(0, 3));
          }
        }
        
        return null;
      }

      const mappedStatus = statusMap[r.status];
      if (!mappedStatus) {
        console.error(`Status mapping failed for: "${r.status}"`);
        console.error(`Available statuses:`, Object.keys(statusMap));
        throw new Error(`Invalid status: ${r.status}`);
      }

      return {
        account_id: accountId,
        seller_id: sellerId,
        status: mappedStatus as any,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  console.log(`Uploading ${relationshipsToUpsert.length} relationships in batches...`);
  console.log(`Sample relationship data:`, relationshipsToUpsert[0]);
  
  // Debug: Check if any relationships have invalid status
  const invalidStatuses = relationshipsToUpsert.filter(r => !r.status);
  if (invalidStatuses.length > 0) {
    console.error(`Found ${invalidStatuses.length} relationships with invalid status:`, invalidStatuses);
  }

  // Batch upsert relationships
  const relationshipChunks = chunk(relationshipsToUpsert, BATCH_SIZE);

  for (let i = 0; i < relationshipChunks.length; i++) {
    console.log(`Processing relationships batch ${i + 1}/${relationshipChunks.length}...`);
    const { error } = await supabase
      .from("relationship_maps")
      .upsert(relationshipChunks[i], { 
        onConflict: "account_id,seller_id",
        ignoreDuplicates: false 
      });

    if (error) {
      console.error(`Error details for batch ${i + 1}:`, error);
      throw new Error(`Failed to upsert relationships batch ${i + 1}: ${error.message}`);
    }
  }

  console.log(`✓ Successfully imported ${relationshipsToUpsert.length} relationships`);

  // Create snapshot for original_relationships table
  console.log(`Creating snapshot of ${relationshipsToUpsert.length} original relationships...`);
  
  const snapshotRows = relationshipsToUpsert.map(({ account_id, seller_id }) => ({
    account_id,
    seller_id,
  }));

  const snapshotChunks = chunk(snapshotRows, BATCH_SIZE);

  for (let i = 0; i < snapshotChunks.length; i++) {
    console.log(`Processing original snapshot batch ${i + 1}/${snapshotChunks.length}...`);
    const { error } = await supabase
      .from("original_relationships")
      .upsert(snapshotChunks[i], { 
        onConflict: "account_id,seller_id",
        ignoreDuplicates: false 
      });

    if (error) {
      console.error(`Error details for original snapshot batch ${i + 1}:`, error);
      throw new Error(`Failed to create original snapshot batch ${i + 1}: ${error.message}`);
    }
  }

  console.log(`✓ Successfully created snapshot of ${snapshotRows.length} original relationships`);

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
        file_name: file.name,
        file_size: file.size,
        snapshot_count: snapshotRows.length,
      }
    );
    
    await logAuditEvent(auditData);
  }
}

// ========== Managers.xlsx ==========
type ManagerRow = {
  manager_name: string;
  manager_email: string;
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

  console.log(`📊 Total managers found: ${managersToUpsert.length}`);
  console.log(`📊 Unique managers after deduplication: ${uniqueManagers.length}`);
  
  if (managersToUpsert.length !== uniqueManagers.length) {
    console.log(`⚠️ Removed ${managersToUpsert.length - uniqueManagers.length} duplicate managers`);
  }

  console.log(`Uploading ${uniqueManagers.length} managers in batches...`);

  const managerChunks = chunk(uniqueManagers, BATCH_SIZE);

  for (let i = 0; i < managerChunks.length; i++) {
    console.log(`Processing managers batch ${i + 1}/${managerChunks.length}...`);
    const { error } = await supabase
      .from("managers")
      .upsert(managerChunks[i], { onConflict: "user_id" });

    if (error) throw new Error(`Failed to upsert managers batch ${i + 1}: ${error.message}`);
  }

  console.log(`✓ Successfully imported ${uniqueManagers.length} managers`);

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
  }
}

// ========== ManagerTeam.xlsx ==========
type ManagerTeamRow = {
  manager_name: string;
  seller_name: string;
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
  console.log("Prefetching managers and sellers...");

  // Fetch all sellers with pagination to get all records
  console.log("📥 Fetching all sellers with pagination...");
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
      console.log(`📥 Fetched ${data.length} sellers (total: ${allSellers.length})`);
    } else {
      hasMore = false;
    }
    
    // Safety check to prevent infinite loop
    if (from > 10000) {
      console.warn("⚠️ Stopping pagination at 10,000 records to prevent infinite loop");
      break;
    }
  }
  
  console.log(`📊 Total sellers fetched: ${allSellers.length}`);

  const managersRes = await supabase.from("managers").select("id,name");

  if (managersRes.error) throw new Error(`Failed to fetch managers: ${managersRes.error.message}`);

  const managerMap = new Map(managersRes.data?.map(m => [m.name.toLowerCase(), m.id]) ?? []);
  const sellerMap = new Map(allSellers.map(s => [s.name, s.id]));

  console.log(`📊 Found ${managerMap.size} managers and ${sellerMap.size} sellers for team assignment`);
  console.log("📋 Sample manager names:", Array.from(managerMap.keys()).slice(0, 5));
  console.log("📋 Sample seller names:", Array.from(sellerMap.keys()).slice(0, 5));

  // Collect missing managers and sellers for reporting
  const missingManagers = new Set<string>();
  const missingSellers = new Set<string>();
  const updates: Array<{ sellerId: string; managerId: string }> = [];

  for (const r of rows) {
    if (!r.manager_name || !r.seller_name) continue;

    const managerId = managerMap.get(r.manager_name.toLowerCase());
    const sellerId = sellerMap.get(r.seller_name);

    if (!managerId) {
      missingManagers.add(r.manager_name);
      console.warn(`⚠️ Manager "${r.manager_name}" not found, skipping assignment`);
      continue;
    }

    if (!sellerId) {
      missingSellers.add(r.seller_name);
      console.warn(`⚠️ Seller "${r.seller_name}" not found, skipping assignment`);
      
      // Show similar seller names for debugging
      const similarSellers = Array.from(sellerMap.keys()).filter(name => 
        name.toLowerCase().includes(r.seller_name.toLowerCase()) || 
        r.seller_name.toLowerCase().includes(name.toLowerCase())
      );
      if (similarSellers.length > 0) {
        console.warn(`💡 Similar seller names found:`, similarSellers.slice(0, 3));
      }
      
      // Check for exact match with different case
      const exactMatch = Array.from(sellerMap.keys()).find(name => 
        name.toLowerCase() === r.seller_name.toLowerCase()
      );
      if (exactMatch) {
        console.warn(`🔍 Case mismatch found! Looking for: "${r.seller_name}" but found: "${exactMatch}"`);
      }
      
      continue;
    }

    updates.push({ sellerId, managerId });
  }

  // Report missing data
  if (missingManagers.size > 0) {
    console.error(`❌ Missing Managers (${missingManagers.size}):`, Array.from(missingManagers));
    throw new Error(`Managers not found (must run Managers.xlsx import first): ${Array.from(missingManagers).join(", ")}`);
  }
  
  if (missingSellers.size > 0) {
    console.error(`❌ Missing Sellers (${missingSellers.size}):`, Array.from(missingSellers));
    console.warn(`⚠️ These sellers are referenced in Manager_Team but don't exist in the Sellers sheet`);
    console.warn(`💡 Please check your Excel file for data consistency`);
  }

  console.log(`Assigning ${updates.length} sellers to managers in batches...`);

  // Batch update sellers
  const updateChunks = chunk(updates, BATCH_SIZE);

  for (let i = 0; i < updateChunks.length; i++) {
    console.log(`Processing assignments batch ${i + 1}/${updateChunks.length}...`);

    const chunk = updateChunks[i];
    const sellerIds = chunk.map(u => u.sellerId);

    // Group by manager_id for efficient updates
    const byManager = new Map<string, string[]>();
    for (const u of chunk) {
      if (!byManager.has(u.managerId)) byManager.set(u.managerId, []);
      byManager.get(u.managerId)!.push(u.sellerId);
    }

    // Update in parallel for each manager
    const promises = Array.from(byManager.entries()).map(([managerId, sellerIds]) =>
      supabase
        .from("sellers")
        .update({ manager_id: managerId })
        .in("id", sellerIds)
    );

    const results = await Promise.all(promises);
    const errors = results.filter(r => r.error);

    if (errors.length > 0) {
      throw new Error(`Failed to update sellers: ${errors.map(e => e.error?.message).join(", ")}`);
    }
  }

  console.log(`✓ Successfully assigned ${updates.length} sellers to managers`);

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
        records_count: updates.length,
        file_name: file.name,
        file_size: file.size,
        assignments_count: updates.length,
      }
    );
    
    await logAuditEvent(auditData);
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
          country: "United States",
          latitude: 37.7749,
          longitude: -122.4194,
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
          country: "United States",
          latitude: 40.7128,
          longitude: -74.0060,
          tenure_months: 24
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
          status: "assigned"
        }
      ];
      filename = "RelationshipMap_Template.xlsx";
      sheetName = "RelationshipMap";
      break;

    case "mgrteam":
      templateData = [
        {
          manager_name: "Jane Manager",
          seller_name: "John Smith"
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
      "Make sure manager and seller names match exactly with existing records."
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
      country: "United States",
      latitude: 37.7749,
      longitude: -122.4194,
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
      country: "United States",
      latitude: 40.7128,
      longitude: -74.0060,
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
      country: "United States",
      latitude: 40.7128,
      longitude: -74.0060,
      tenure_months: 24
    },
    {
      seller_name: "Sarah Johnson",
      division: "GDT",
      size: "midmarket",
      industry_specialty: "Technology",
      state: "CA",
      city: "San Francisco",
      country: "United States",
      latitude: 37.7749,
      longitude: -122.4194,
      tenure_months: 18
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
      status: "assigned"
    },
    {
      account_name: "Tech Solutions Inc",
      seller_name: "Sarah Johnson",
      status: "pinned"
    }
  ];
  
  const relationshipWs = XLSX.utils.json_to_sheet(relationshipData);
  XLSX.utils.book_append_sheet(wb, relationshipWs, "Relationship_Map");
  
  // 5. MANAGER_TEAM TAB
  const managerTeamData = [
    {
      manager_name: "Jane Manager",
      seller_name: "John Smith"
    },
    {
      manager_name: "Mike Director",
      seller_name: "Sarah Johnson"
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
    ["• Sellers: seller_name, division, size"],
    ["• Managers: manager_name, manager_email"],
    ["• Relationship_Map: account_name, seller_name, status"],
    ["• Manager_Team: manager_name, seller_name"],
    [""],
    ["VALID VALUES:"],
    ["• size: 'enterprise' or 'midmarket'"],
    ["• division/current_division: 'ESG', 'GDT', 'GVC', 'MSG_US'"],
    ["• status: 'approval_for_pinning', 'pinned', 'approval_for_assigning', 'assigned', 'up_for_debate', 'peeled', 'available', 'must_keep', 'for_discussion', 'to_be_peeled'"],
    [""],
    ["IMPORTANT NOTES:"],
    ["• Manager emails must match existing user profiles"],
    ["• Account and seller names must match exactly between tabs"],
    ["• Latitude/longitude are optional but recommended for mapping"]
  ];
  
  const instructionsWs = XLSX.utils.json_to_sheet(instructionsData);
  XLSX.utils.book_append_sheet(wb, instructionsWs, "Instructions");
  
  // Generate and download file
  XLSX.writeFile(wb, "BAIN_Data_Import_Template.xlsx");
}

// ========== Comprehensive Import Function ==========

export async function importComprehensiveData(file: File, userId?: string) {
  console.log("🚀 Starting Comprehensive Data Import");
  console.log("📁 File:", file.name, "Size:", file.size, "bytes");
  console.log("👤 User ID:", userId);
  console.log("⏰ Start Time:", new Date().toISOString());
  
  const wb = await readSheet(file);
  
  console.log("📊 Available sheets:", wb.SheetNames);
  console.log("📋 Sheet count:", wb.SheetNames.length);
  
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
      console.log("👥 STEP 1: Processing Managers Tab");
      console.log("📋 Found Managers sheet in Excel file");
      try {
        // Truncate managers table first
        console.log("🗑️ Truncating managers table...");
        const { error: truncateError } = await supabase
          .from("managers")
          .delete()
          .neq("id", "00000000-0000-0000-0000-000000000000"); // Delete all records
        
        if (truncateError) {
          console.error("❌ Failed to truncate managers table:", truncateError);
          throw new Error(`Failed to truncate managers table: ${truncateError.message}`);
        }
        console.log("✅ Managers table truncated successfully");

        const managersData = sheetToJson<ManagerRow>(wb, "Managers");
        console.log("📊 Managers data extracted:", managersData.length, "records");
        console.log("📝 Sample manager data:", managersData.slice(0, 2));
        
        if (managersData.length > 0) {
          console.log("🔄 Creating temporary file for managers import...");
          // Create a temporary file for managers import
          const tempWb = XLSX.utils.book_new();
          const tempWs = XLSX.utils.json_to_sheet(managersData);
          XLSX.utils.book_append_sheet(tempWb, tempWs, "Managers");
          const tempFile = new File([XLSX.write(tempWb, { bookType: 'xlsx', type: 'array' })], "temp_managers.xlsx");
          
          console.log("📤 Starting managers import process...");
          await importManagers(tempFile, userId);
          results.managers.imported = managersData.length;
          console.log(`✅ Successfully imported ${managersData.length} managers`);
        } else {
          console.log("⚠️ No manager data found in Managers sheet");
        }
      } catch (error) {
        console.error("❌ Manager import failed:", error);
        results.managers.errors.push(`Manager import failed: ${error}`);
        console.error("Manager import error:", error);
      }
    } else {
      console.log("⚠️ No Managers sheet found in Excel file");
    }
    
    // 2. Import Accounts
    if (wb.SheetNames.includes("Accounts")) {
      console.log("🏢 STEP 2: Processing Accounts Tab");
      console.log("📋 Found Accounts sheet in Excel file");
      try {
        // Truncate accounts and account_revenues tables first
        console.log("🗑️ Truncating accounts and account_revenues tables...");
        
        // Delete account_revenues first (foreign key constraint)
        console.log("🗑️ Deleting account_revenues records...");
        const { error: revenueTruncateError } = await supabase
          .from("account_revenues")
          .delete()
          .neq("account_id", "00000000-0000-0000-0000-000000000000");
        
        if (revenueTruncateError) {
          console.error("❌ Failed to truncate account_revenues table:", revenueTruncateError);
          throw new Error(`Failed to truncate account_revenues table: ${revenueTruncateError.message}`);
        }
        console.log("✅ Account_revenues table truncated successfully");
        
        // Delete accounts
        console.log("🗑️ Deleting accounts records...");
        const { error: accountTruncateError } = await supabase
          .from("accounts")
          .delete()
          .neq("id", "00000000-0000-0000-0000-000000000000");
        
        if (accountTruncateError) {
          console.error("❌ Failed to truncate accounts table:", accountTruncateError);
          throw new Error(`Failed to truncate accounts table: ${accountTruncateError.message}`);
        }
        
        console.log("✅ Accounts and account_revenues tables truncated successfully");

        const accountsData = sheetToJson<AccountRow>(wb, "Accounts");
        console.log("📊 Accounts data extracted:", accountsData.length, "records");
        console.log("📝 Sample account data:", accountsData.slice(0, 2));
        
        if (accountsData.length > 0) {
          console.log("🔄 Creating temporary file for accounts import...");
          const tempWb = XLSX.utils.book_new();
          const tempWs = XLSX.utils.json_to_sheet(accountsData);
          XLSX.utils.book_append_sheet(tempWb, tempWs, "Accounts");
          const tempFile = new File([XLSX.write(tempWb, { bookType: 'xlsx', type: 'array' })], "temp_accounts.xlsx");
          
          console.log("📤 Starting accounts import process...");
          await importAccounts(tempFile, userId);
          results.accounts.imported = accountsData.length;
          console.log(`✅ Successfully imported ${accountsData.length} accounts`);
        } else {
          console.log("⚠️ No account data found in Accounts sheet");
        }
      } catch (error) {
        console.error("❌ Account import failed:", error);
        results.accounts.errors.push(`Account import failed: ${error}`);
        console.error("Account import error:", error);
      }
    } else {
      console.log("⚠️ No Accounts sheet found in Excel file");
    }
    
    // 3. Import Sellers
    if (wb.SheetNames.includes("Sellers")) {
      console.log("👨‍💼 STEP 3: Processing Sellers Tab");
      console.log("📋 Found Sellers sheet in Excel file");
      try {
        // Truncate sellers table first
        console.log("🗑️ Truncating sellers table...");
        const { error: truncateError } = await supabase
          .from("sellers")
          .delete()
          .neq("id", "00000000-0000-0000-0000-000000000000");
        
        if (truncateError) {
          console.error("❌ Failed to truncate sellers table:", truncateError);
          throw new Error(`Failed to truncate sellers table: ${truncateError.message}`);
        }
        console.log("✅ Sellers table truncated successfully");

        const sellersData = sheetToJson<SellerRow>(wb, "Sellers");
        console.log("📊 Sellers data extracted:", sellersData.length, "records");
        console.log("📝 Sample seller data:", sellersData.slice(0, 2));
        
        if (sellersData.length > 0) {
          console.log("🔄 Creating temporary file for sellers import...");
          const tempWb = XLSX.utils.book_new();
          const tempWs = XLSX.utils.json_to_sheet(sellersData);
          XLSX.utils.book_append_sheet(tempWb, tempWs, "Sellers");
          const tempFile = new File([XLSX.write(tempWb, { bookType: 'xlsx', type: 'array' })], "temp_sellers.xlsx");
          
          console.log("📤 Starting sellers import process...");
          await importSellers(tempFile, userId);
          results.sellers.imported = sellersData.length;
          console.log(`✅ Successfully imported ${sellersData.length} sellers`);
        } else {
          console.log("⚠️ No seller data found in Sellers sheet");
        }
      } catch (error) {
        console.error("❌ Seller import failed:", error);
        results.sellers.errors.push(`Seller import failed: ${error}`);
        console.error("Seller import error:", error);
      }
    } else {
      console.log("⚠️ No Sellers sheet found in Excel file");
    }
    
    // 4. Import Relationship Map
    if (wb.SheetNames.includes("Relationship_Map")) {
      console.log("🔗 STEP 4: Processing Relationship_Map Tab");
      console.log("📋 Found Relationship_Map sheet in Excel file");
      try {
        // Truncate relationship_maps and original_relationships tables first
        console.log("🗑️ Truncating relationship_maps and original_relationships tables...");
        
        // Delete original_relationships first (foreign key constraint)
        console.log("🗑️ Deleting original_relationships records...");
        const { error: originalTruncateError } = await supabase
          .from("original_relationships")
          .delete()
          .neq("account_id", "00000000-0000-0000-0000-000000000000");
        
        if (originalTruncateError) {
          console.error("❌ Failed to truncate original_relationships table:", originalTruncateError);
          throw new Error(`Failed to truncate original_relationships table: ${originalTruncateError.message}`);
        }
        console.log("✅ Original_relationships table truncated successfully");
        
        // Delete relationship_maps
        console.log("🗑️ Deleting relationship_maps records...");
        const { error: relationshipTruncateError } = await supabase
          .from("relationship_maps")
          .delete()
          .neq("account_id", "00000000-0000-0000-0000-000000000000");
        
        if (relationshipTruncateError) {
          console.error("❌ Failed to truncate relationship_maps table:", relationshipTruncateError);
          throw new Error(`Failed to truncate relationship_maps table: ${relationshipTruncateError.message}`);
        }
        
        console.log("✅ Relationship_maps and original_relationships tables truncated successfully");

        const relationshipData = sheetToJson<RelRow>(wb, "Relationship_Map");
        console.log("📊 Relationship data extracted:", relationshipData.length, "records");
        console.log("📝 Sample relationship data:", relationshipData.slice(0, 2));
        
        if (relationshipData.length > 0) {
          console.log("🔄 Creating temporary file for relationships import...");
          const tempWb = XLSX.utils.book_new();
          const tempWs = XLSX.utils.json_to_sheet(relationshipData);
          XLSX.utils.book_append_sheet(tempWb, tempWs, "RelationshipMap");
          const tempFile = new File([XLSX.write(tempWb, { bookType: 'xlsx', type: 'array' })], "temp_relationships.xlsx");
          
          console.log("📤 Starting relationships import process...");
          await importRelationshipMap(tempFile, userId);
          results.relationships.imported = relationshipData.length;
          console.log(`✅ Successfully imported ${relationshipData.length} relationships`);
        } else {
          console.log("⚠️ No relationship data found in Relationship_Map sheet");
        }
      } catch (error) {
        console.error("❌ Relationship import failed:", error);
        results.relationships.errors.push(`Relationship import failed: ${error}`);
        console.error("Relationship import error:", error);
      }
    } else {
      console.log("⚠️ No Relationship_Map sheet found in Excel file");
    }
    
    // 5. Import Manager Teams
    if (wb.SheetNames.includes("Manager_Team")) {
      console.log("👥 STEP 5: Processing Manager_Team Tab");
      console.log("📋 Found Manager_Team sheet in Excel file");
      try {
        // Reset all seller manager_id fields to null first
        console.log("🔄 Resetting seller manager assignments...");
        const { error: resetError } = await supabase
          .from("sellers")
          .update({ manager_id: null })
          .not("manager_id", "is", null);
        
        if (resetError) {
          console.error("❌ Failed to reset seller manager assignments:", resetError);
          throw new Error(`Failed to reset seller manager assignments: ${resetError.message}`);
        }
        console.log("✅ Seller manager assignments reset successfully");

        const managerTeamData = sheetToJson<ManagerTeamRow>(wb, "Manager_Team");
        console.log("📊 Manager team data extracted:", managerTeamData.length, "records");
        console.log("📝 Sample manager team data:", managerTeamData.slice(0, 2));
        
        if (managerTeamData.length > 0) {
          console.log("🔄 Creating temporary file for manager teams import...");
          const tempWb = XLSX.utils.book_new();
          const tempWs = XLSX.utils.json_to_sheet(managerTeamData);
          XLSX.utils.book_append_sheet(tempWb, tempWs, "ManagerTeam");
          const tempFile = new File([XLSX.write(tempWb, { bookType: 'xlsx', type: 'array' })], "temp_manager_teams.xlsx");
          
          console.log("📤 Starting manager teams import process...");
          await importManagerTeam(tempFile, userId);
          results.managerTeams.imported = managerTeamData.length;
          console.log(`✅ Successfully imported ${managerTeamData.length} manager team assignments`);
        } else {
          console.log("⚠️ No manager team data found in Manager_Team sheet");
        }
      } catch (error) {
        console.error("❌ Manager team import failed:", error);
        results.managerTeams.errors.push(`Manager team import failed: ${error}`);
        console.error("Manager team import error:", error);
      }
    } else {
      console.log("⚠️ No Manager_Team sheet found in Excel file");
    }
    
    // Log comprehensive audit event
    console.log("📝 Logging comprehensive audit event...");
    if (userId) {
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
      console.log("✅ Audit event logged successfully");
    }
    
    // Final summary
    console.log("🎉 COMPREHENSIVE IMPORT COMPLETED");
    console.log("⏰ End Time:", new Date().toISOString());
    console.log("📊 Final Results Summary:");
    console.log("  👥 Managers:", results.managers.imported, "imported,", results.managers.errors.length, "errors");
    console.log("  🏢 Accounts:", results.accounts.imported, "imported,", results.accounts.errors.length, "errors");
    console.log("  👨‍💼 Sellers:", results.sellers.imported, "imported,", results.sellers.errors.length, "errors");
    console.log("  🔗 Relationships:", results.relationships.imported, "imported,", results.relationships.errors.length, "errors");
    console.log("  👥 Manager Teams:", results.managerTeams.imported, "imported,", results.managerTeams.errors.length, "errors");
    
    const totalImported = Object.values(results).reduce((sum: number, result: any) => sum + result.imported, 0);
    const totalErrors = Object.values(results).reduce((sum: number, result: any) => sum + result.errors.length, 0);
    
    console.log("📈 TOTAL:", totalImported, "records imported,", totalErrors, "errors");
    
    if (totalErrors > 0) {
      console.log("⚠️ Errors encountered:");
      Object.entries(results).forEach(([key, result]: [string, any]) => {
        if (result.errors.length > 0) {
          console.log(`  ${key}:`, result.errors);
        }
      });
    }
    
    return results;
    
  } catch (error) {
    console.error("💥 COMPREHENSIVE IMPORT FAILED:", error);
    console.error("⏰ Failure Time:", new Date().toISOString());
    throw error;
  }
}
