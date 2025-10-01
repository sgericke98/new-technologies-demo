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
  state: string | null;
  city: string | null;
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
    "MSG_US": "MSG_US",
  };

  // Prepare account data
  const accountsToUpsert = rows
    .filter(r => r.account_name)
    .map(r => {
      const normalizedDivision = divisionMap[r.current_division];
      if (!normalizedDivision) {
        throw new Error(`Invalid division: ${r.current_division}`);
      }
      return {
        name: r.account_name,
        industry: r.industry,
        size: r.size,
        state: r.state,
        city: r.city,
        lat: r.latitude,
        lng: r.longitude,
        current_division: normalizedDivision as any,
      };
    });

  console.log(`Uploading ${accountsToUpsert.length} accounts in batches...`);

  // Batch upsert accounts
  const accountChunks = chunk(accountsToUpsert, BATCH_SIZE);
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

  // Prepare revenue data
  const revenuesToUpsert = rows
    .filter(r => r.account_name && accountMap.has(r.account_name))
    .map(r => ({
      account_id: accountMap.get(r.account_name)!,
      revenue_esg: r.revenue_ESG ?? 0,
      revenue_gdt: r.revenue_GDT ?? 0,
      revenue_gvc: r.revenue_GVC ?? 0,
      revenue_msg_us: r.revenue_MSG_US ?? 0,
    }));

  console.log(`Uploading ${revenuesToUpsert.length} account revenues in batches...`);

  // Batch upsert revenues
  const revenueChunks = chunk(revenuesToUpsert, BATCH_SIZE);

  for (let i = 0; i < revenueChunks.length; i++) {
    console.log(`Processing revenues batch ${i + 1}/${revenueChunks.length}...`);
    const { error } = await supabase
      .from("account_revenues")
      .upsert(revenueChunks[i], { onConflict: "account_id" });

    if (error) throw new Error(`Failed to upsert revenues batch ${i + 1}: ${error.message}`);
  }

  console.log(`✓ Successfully imported ${accountsToUpsert.length} accounts with revenues`);

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
        records_count: accountsToUpsert.length,
        file_name: file.name,
        file_size: file.size,
        revenue_records_count: revenuesToUpsert.length,
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
  latitude: number | null;
  longitude: number | null;
  manager_name?: string | null;
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

  // Prefetch all managers
  const { data: managers, error: mgrErr } = await supabase
    .from("managers")
    .select("id,name");

  if (mgrErr) throw new Error(`Failed to fetch managers: ${mgrErr.message}`);

  const managerMap = new Map(managers?.map(m => [m.name.toLowerCase(), m.id]) ?? []);

  const divisionMap: Record<string, string> = {
    "ESG": "ESG",
    "GDT": "GDT",
    "GVC": "GVC",
    "MSG US": "MSG_US",
    "MSG_US": "MSG_US",
  };

  // Prepare seller data
  const missingManagers = new Set<string>();
  const sellersToUpsert = rows
    .filter(r => r.seller_name)
    .map(r => {
      const normalizedDivision = divisionMap[r.division];
      if (!normalizedDivision) {
        throw new Error(`Invalid division: ${r.division}`);
      }

      let managerId: string | null = null;
      if (r.manager_name) {
        managerId = managerMap.get(r.manager_name.toLowerCase()) ?? null;
        if (!managerId) {
          missingManagers.add(r.manager_name);
        }
      }

      return {
        name: r.seller_name,
        division: normalizedDivision as any,
        size: r.size,
        industry_specialty: r.industry_specialty,
        state: r.state,
        city: r.city,
        lat: r.latitude,
        lng: r.longitude,
        tenure_months: r.tenure_months ?? null,
        manager_id: managerId,
      };
    });

  if (missingManagers.size > 0) {
    console.warn(`Warning: Managers not found: ${Array.from(missingManagers).join(", ")}`);
  }

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
        missing_managers: Array.from(missingManagers),
      }
    );
    
    await logAuditEvent(auditData);
  }
}

// ========== RelationshipMap.xlsx ==========
type RelRow = {
  account_name: string;
  seller_name: string;
  pct_ESG?: number | null;
  pct_GDT?: number | null;
  pct_GVC?: number | null;
  pct_MSG_US?: number | null;
  status: "approval for pinning" | "pinned" | "approval for assigning" | "assigned" | "approval_for_pinning" | "approval_for_assigning";
  last_actor_email?: string | null;
};

const statusMap: Record<string, string> = {
  // User-friendly names
  "approval for pinning": "approval_for_pinning",
  "pinned": "pinned",
  "approval for assigning": "approval_for_assigning",
  "assigned": "assigned",
  // Database enum values (in case Excel contains these directly)
  "approval_for_pinning": "approval_for_pinning",
  "approval_for_assigning": "approval_for_assigning",
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

  const [accountsRes, sellersRes, profilesRes] = await Promise.all([
    supabase.from("accounts").select("id,name"),
    supabase.from("sellers").select("id,name"),
    supabase.from("profiles").select("id,email"),
  ]);

  if (accountsRes.error) throw new Error(`Failed to fetch accounts: ${accountsRes.error.message}`);
  if (sellersRes.error) throw new Error(`Failed to fetch sellers: ${sellersRes.error.message}`);
  if (profilesRes.error) throw new Error(`Failed to fetch profiles: ${profilesRes.error.message}`);

  const accountMap = new Map(accountsRes.data?.map(a => [a.name, a.id]) ?? []);
  const sellerMap = new Map(sellersRes.data?.map(s => [s.name, s.id]) ?? []);
  const profileMap = new Map(profilesRes.data?.map(p => [p.email.toLowerCase(), p.id]) ?? []);

  // Prepare relationship data
  const relationshipsToUpsert = rows
    .filter(r => r.account_name && r.seller_name)
    .map(r => {
      const accountId = accountMap.get(r.account_name);
      const sellerId = sellerMap.get(r.seller_name);

      if (!accountId || !sellerId) {
        console.warn(`Skipping relationship: account "${r.account_name}" or seller "${r.seller_name}" not found`);
        return null;
      }

      const mappedStatus = statusMap[r.status];
      if (!mappedStatus) {
        console.error(`Status mapping failed for: "${r.status}"`);
        console.error(`Available statuses:`, Object.keys(statusMap));
        throw new Error(`Invalid status: ${r.status}`);
      }

      let lastActorUserId: string | null = null;
      if (r.last_actor_email) {
        lastActorUserId = profileMap.get(r.last_actor_email.toLowerCase()) ?? null;
      }

      return {
        account_id: accountId,
        seller_id: sellerId,
        pct_esg: r.pct_ESG ?? 0,
        pct_gdt: r.pct_GDT ?? 0,
        pct_gvc: r.pct_GVC ?? 0,
        pct_msg_us: r.pct_MSG_US ?? 0,
        status: mappedStatus as any,
        last_actor_user_id: lastActorUserId,
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
  
  const snapshotRows = relationshipsToUpsert.map(({ account_id, seller_id, pct_esg, pct_gdt, pct_gvc, pct_msg_us }) => ({
    account_id,
    seller_id,
    pct_esg,
    pct_gdt,
    pct_gvc,
    pct_msg_us,
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

  console.log(`Uploading ${managersToUpsert.length} managers in batches...`);

  const managerChunks = chunk(managersToUpsert, BATCH_SIZE);

  for (let i = 0; i < managerChunks.length; i++) {
    console.log(`Processing managers batch ${i + 1}/${managerChunks.length}...`);
    const { error } = await supabase
      .from("managers")
      .upsert(managerChunks[i], { onConflict: "user_id" });

    if (error) throw new Error(`Failed to upsert managers batch ${i + 1}: ${error.message}`);
  }

  console.log(`✓ Successfully imported ${managersToUpsert.length} managers`);

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
        records_count: managersToUpsert.length,
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

  const [managersRes, sellersRes] = await Promise.all([
    supabase.from("managers").select("id,name"),
    supabase.from("sellers").select("id,name"),
  ]);

  if (managersRes.error) throw new Error(`Failed to fetch managers: ${managersRes.error.message}`);
  if (sellersRes.error) throw new Error(`Failed to fetch sellers: ${sellersRes.error.message}`);

  const managerMap = new Map(managersRes.data?.map(m => [m.name.toLowerCase(), m.id]) ?? []);
  const sellerMap = new Map(sellersRes.data?.map(s => [s.name, s.id]) ?? []);

  // Collect missing managers
  const missingManagers = new Set<string>();
  const updates: Array<{ sellerId: string; managerId: string }> = [];

  for (const r of rows) {
    if (!r.manager_name || !r.seller_name) continue;

    const managerId = managerMap.get(r.manager_name.toLowerCase());
    const sellerId = sellerMap.get(r.seller_name);

    if (!managerId) {
      missingManagers.add(r.manager_name);
      continue;
    }

    if (!sellerId) {
      console.warn(`Seller "${r.seller_name}" not found, skipping assignment`);
      continue;
    }

    updates.push({ sellerId, managerId });
  }

  if (missingManagers.size > 0) {
    throw new Error(`Managers not found (must run Managers.xlsx import first): ${Array.from(missingManagers).join(", ")}`);
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
          state: "CA",
          city: "San Francisco",
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
          latitude: 40.7128,
          longitude: -74.0060,
          manager_name: "Jane Manager",
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
          pct_ESG: 50,
          pct_GDT: 30,
          pct_GVC: 20,
          pct_MSG_US: 0,
          status: "assigned",
          last_actor_email: "jane.manager@company.com"
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
      "NOTE: manager_name is optional and will be mapped to manager_id in the database.",
      "If specified, the manager must already exist in the system."
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
      state: "CA",
      city: "San Francisco",
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
      state: "NY",
      city: "New York",
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
      latitude: 40.7128,
      longitude: -74.0060,
      manager_name: "Jane Manager",
      tenure_months: 24
    },
    {
      seller_name: "Sarah Johnson",
      division: "GDT",
      size: "midmarket",
      industry_specialty: "Technology",
      state: "CA",
      city: "San Francisco",
      latitude: 37.7749,
      longitude: -122.4194,
      manager_name: "Mike Director",
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
      pct_ESG: 50,
      pct_GDT: 30,
      pct_GVC: 20,
      pct_MSG_US: 0,
      status: "assigned",
      last_actor_email: "jane.manager@company.com"
    },
    {
      account_name: "Tech Solutions Inc",
      seller_name: "Sarah Johnson",
      pct_ESG: 0,
      pct_GDT: 80,
      pct_GVC: 20,
      pct_MSG_US: 0,
      status: "pinned",
      last_actor_email: "mike.director@company.com"
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
    ["• Revenue percentages should add up to 100% for each relationship"],
    ["• Latitude/longitude are optional but recommended for mapping"],
    ["• All percentages should be numbers (0-100), not decimals"]
  ];
  
  const instructionsWs = XLSX.utils.json_to_sheet(instructionsData);
  XLSX.utils.book_append_sheet(wb, instructionsWs, "Instructions");
  
  // Generate and download file
  XLSX.writeFile(wb, "BAIN_Data_Import_Template.xlsx");
}

// ========== Comprehensive Import Function ==========

export async function importComprehensiveData(file: File, userId?: string) {
  const wb = await readSheet(file);
  
  console.log("Available sheets:", wb.SheetNames);
  
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
      console.log("Importing managers...");
      try {
        const managersData = sheetToJson<ManagerRow>(wb, "Managers");
        if (managersData.length > 0) {
          // Create a temporary file for managers import
          const tempWb = XLSX.utils.book_new();
          const tempWs = XLSX.utils.json_to_sheet(managersData);
          XLSX.utils.book_append_sheet(tempWb, tempWs, "Managers");
          const tempFile = new File([XLSX.write(tempWb, { bookType: 'xlsx', type: 'array' })], "temp_managers.xlsx");
          
          await importManagers(tempFile, userId);
          results.managers.imported = managersData.length;
          console.log(`✓ Imported ${managersData.length} managers`);
        }
      } catch (error) {
        results.managers.errors.push(`Manager import failed: ${error}`);
        console.error("Manager import error:", error);
      }
    }
    
    // 2. Import Accounts
    if (wb.SheetNames.includes("Accounts")) {
      console.log("Importing accounts...");
      try {
        const accountsData = sheetToJson<AccountRow>(wb, "Accounts");
        if (accountsData.length > 0) {
          const tempWb = XLSX.utils.book_new();
          const tempWs = XLSX.utils.json_to_sheet(accountsData);
          XLSX.utils.book_append_sheet(tempWb, tempWs, "Accounts");
          const tempFile = new File([XLSX.write(tempWb, { bookType: 'xlsx', type: 'array' })], "temp_accounts.xlsx");
          
          await importAccounts(tempFile, userId);
          results.accounts.imported = accountsData.length;
          console.log(`✓ Imported ${accountsData.length} accounts`);
        }
      } catch (error) {
        results.accounts.errors.push(`Account import failed: ${error}`);
        console.error("Account import error:", error);
      }
    }
    
    // 3. Import Sellers
    if (wb.SheetNames.includes("Sellers")) {
      console.log("Importing sellers...");
      try {
        const sellersData = sheetToJson<SellerRow>(wb, "Sellers");
        if (sellersData.length > 0) {
          const tempWb = XLSX.utils.book_new();
          const tempWs = XLSX.utils.json_to_sheet(sellersData);
          XLSX.utils.book_append_sheet(tempWb, tempWs, "Sellers");
          const tempFile = new File([XLSX.write(tempWb, { bookType: 'xlsx', type: 'array' })], "temp_sellers.xlsx");
          
          await importSellers(tempFile, userId);
          results.sellers.imported = sellersData.length;
          console.log(`✓ Imported ${sellersData.length} sellers`);
        }
      } catch (error) {
        results.sellers.errors.push(`Seller import failed: ${error}`);
        console.error("Seller import error:", error);
      }
    }
    
    // 4. Import Relationship Map
    if (wb.SheetNames.includes("Relationship_Map")) {
      console.log("Importing relationships...");
      try {
        const relationshipData = sheetToJson<RelRow>(wb, "Relationship_Map");
        if (relationshipData.length > 0) {
          const tempWb = XLSX.utils.book_new();
          const tempWs = XLSX.utils.json_to_sheet(relationshipData);
          XLSX.utils.book_append_sheet(tempWb, tempWs, "RelationshipMap");
          const tempFile = new File([XLSX.write(tempWb, { bookType: 'xlsx', type: 'array' })], "temp_relationships.xlsx");
          
          await importRelationshipMap(tempFile, userId);
          results.relationships.imported = relationshipData.length;
          console.log(`✓ Imported ${relationshipData.length} relationships`);
        }
      } catch (error) {
        results.relationships.errors.push(`Relationship import failed: ${error}`);
        console.error("Relationship import error:", error);
      }
    }
    
    // 5. Import Manager Teams
    if (wb.SheetNames.includes("Manager_Team")) {
      console.log("Importing manager teams...");
      try {
        const managerTeamData = sheetToJson<ManagerTeamRow>(wb, "Manager_Team");
        if (managerTeamData.length > 0) {
          const tempWb = XLSX.utils.book_new();
          const tempWs = XLSX.utils.json_to_sheet(managerTeamData);
          XLSX.utils.book_append_sheet(tempWb, tempWs, "ManagerTeam");
          const tempFile = new File([XLSX.write(tempWb, { bookType: 'xlsx', type: 'array' })], "temp_manager_teams.xlsx");
          
          await importManagerTeam(tempFile, userId);
          results.managerTeams.imported = managerTeamData.length;
          console.log(`✓ Imported ${managerTeamData.length} manager team assignments`);
        }
      } catch (error) {
        results.managerTeams.errors.push(`Manager team import failed: ${error}`);
        console.error("Manager team import error:", error);
      }
    }
    
    // Log comprehensive audit event
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
    }
    
    return results;
    
  } catch (error) {
    console.error("Comprehensive import failed:", error);
    throw error;
  }
}
