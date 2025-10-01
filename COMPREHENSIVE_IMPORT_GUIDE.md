# BAIN Comprehensive Data Import Guide

## Overview

This guide explains the database structure, current import functionality, and the new comprehensive Excel template for importing all necessary data in a single file.

## Database Structure & Relations

### Core Tables

#### 1. **accounts**
- **Purpose**: Company/client information
- **Key Fields**: 
  - `id` (UUID, primary key)
  - `name` (string, unique)
  - `industry` (string, nullable)
  - `size` (enum: "enterprise" | "midmarket")
  - `state`, `city` (string, nullable)
  - `lat`, `lng` (number, nullable)
  - `current_division` (enum: "ESG" | "GDT" | "GVC" | "MSG_US")
  - `created_at` (timestamp)

#### 2. **sellers**
- **Purpose**: Sales team members
- **Key Fields**:
  - `id` (UUID, primary key)
  - `name` (string, unique)
  - `division` (enum: "ESG" | "GDT" | "GVC" | "MSG_US")
  - `size` (enum: "enterprise" | "midmarket")
  - `industry_specialty` (string, nullable)
  - `state`, `city` (string, nullable)
  - `lat`, `lng` (number, nullable)
  - `manager_id` (UUID, foreign key to managers.id)
  - `tenure_months` (number, nullable)
  - `book_finalized` (boolean, nullable)
  - `created_at` (timestamp)

#### 3. **managers**
- **Purpose**: Team leaders
- **Key Fields**:
  - `id` (UUID, primary key)
  - `name` (string)
  - `user_id` (UUID, foreign key to profiles.id)
  - `created_at` (timestamp)

#### 4. **profiles**
- **Purpose**: User authentication and basic info
- **Key Fields**:
  - `id` (UUID, primary key)
  - `email` (string, unique)
  - `name` (string)
  - `role` (enum: "MASTER" | "MANAGER")
  - `created_at` (timestamp)

#### 5. **relationship_maps**
- **Purpose**: Account-seller relationships with percentages
- **Key Fields**:
  - `id` (UUID, primary key)
  - `account_id` (UUID, foreign key to accounts.id)
  - `seller_id` (UUID, foreign key to sellers.id)
  - `pct_esg`, `pct_gdt`, `pct_gvc`, `pct_msg_us` (number, nullable)
  - `status` (enum: multiple relationship statuses)
  - `last_actor_user_id` (UUID, foreign key to profiles.id)
  - `updated_at` (timestamp)

#### 6. **account_revenues**
- **Purpose**: Revenue data per account per division
- **Key Fields**:
  - `id` (UUID, primary key)
  - `account_id` (UUID, foreign key to accounts.id)
  - `revenue_esg`, `revenue_gdt`, `revenue_gvc`, `revenue_msg_us` (number, nullable)

#### 7. **original_relationships**
- **Purpose**: Snapshot of original relationship data
- **Key Fields**: Same as relationship_maps but without status/tracking fields

### Supporting Tables

#### 8. **requests**
- **Purpose**: Approval workflow for relationship changes
- **Key Fields**: Request tracking, approval status, etc.

#### 9. **audit_logs**
- **Purpose**: Track all system changes
- **Key Fields**: Action tracking, user actions, data changes

#### 10. **threshold_settings**
- **Purpose**: System configuration
- **Key Fields**: Revenue and account thresholds

### Key Relationships

```
profiles (1) ←→ (1) managers
managers (1) ←→ (many) sellers
accounts (1) ←→ (many) relationship_maps
sellers (1) ←→ (many) relationship_maps
accounts (1) ←→ (1) account_revenues
```

## Current Import Functionality

### Existing Import Functions

1. **importAccounts(file, userId)**
   - Imports accounts and their revenue data
   - Creates entries in `accounts` and `account_revenues` tables
   - Required fields: `account_name`, `size`, `current_division`

2. **importSellers(file, userId)**
   - Imports sellers with manager assignments
   - Creates entries in `sellers` table
   - Required fields: `seller_name`, `division`, `size`
   - Optional: `manager_name` (must exist in managers table)

3. **importManagers(file, userId)**
   - Imports managers linked to user profiles
   - Creates entries in `managers` table
   - Required fields: `manager_name`, `manager_email`
   - Email must match existing profile

4. **importRelationshipMap(file, userId)**
   - Imports account-seller relationships
   - Creates entries in `relationship_maps` and `original_relationships` tables
   - Required fields: `account_name`, `seller_name`, `status`

5. **importManagerTeam(file, userId)**
   - Assigns sellers to managers
   - Updates `manager_id` in sellers table
   - Required fields: `manager_name`, `seller_name`

### Import Order Requirements

1. **Managers** (must be first - sellers need manager references)
2. **Accounts** (independent)
3. **Sellers** (needs managers to exist)
4. **Relationship_Map** (needs accounts and sellers)
5. **Manager_Team** (needs managers and sellers)

## New Comprehensive Template

### Excel File Structure

The new template (`BAIN_Data_Import_Template.xlsx`) contains 6 tabs:

#### 1. **Instructions** (Tab 1)
- Complete import guide
- Required field specifications
- Valid value lists
- Import order instructions

#### 2. **Accounts** (Tab 2)
- Company information and revenue data
- **Required columns**: `account_name`, `size`, `current_division`
- **Optional columns**: `industry`, `state`, `city`, `latitude`, `longitude`
- **Revenue columns**: `revenue_ESG`, `revenue_GDT`, `revenue_GVC`, `revenue_MSG_US`

#### 3. **Sellers** (Tab 3)
- Sales team member information
- **Required columns**: `seller_name`, `division`, `size`
- **Optional columns**: `industry_specialty`, `state`, `city`, `latitude`, `longitude`, `manager_name`, `tenure_months`

#### 4. **Managers** (Tab 4)
- Team leader information
- **Required columns**: `manager_name`, `manager_email`
- **Note**: Email must match existing user profile

#### 5. **Relationship_Map** (Tab 5)
- Account-seller relationships with percentages
- **Required columns**: `account_name`, `seller_name`, `status`
- **Percentage columns**: `pct_ESG`, `pct_GDT`, `pct_GVC`, `pct_MSG_US`
- **Optional columns**: `last_actor_email`

#### 6. **Manager_Team** (Tab 6)
- Manager-seller assignments
- **Required columns**: `manager_name`, `seller_name`

### New Comprehensive Import Function

**`importComprehensiveData(file, userId)`**

- Processes all tabs in correct order
- Handles dependencies automatically
- Provides detailed error reporting
- Maintains audit trail
- Returns comprehensive results

### Usage

```typescript
// Download template
downloadComprehensiveTemplate();

// Import comprehensive data
const results = await importComprehensiveData(file, userId);
console.log(results);
// {
//   accounts: { imported: 10, errors: [] },
//   sellers: { imported: 5, errors: [] },
//   managers: { imported: 2, errors: [] },
//   relationships: { imported: 15, errors: [] },
//   managerTeams: { imported: 5, errors: [] }
// }
```

## Data Validation Rules

### Required Field Validation
- **Accounts**: `account_name`, `size`, `current_division`
- **Sellers**: `seller_name`, `division`, `size`
- **Managers**: `manager_name`, `manager_email`
- **Relationships**: `account_name`, `seller_name`, `status`
- **Manager Teams**: `manager_name`, `seller_name`

### Enum Value Validation
- **size**: "enterprise" | "midmarket"
- **division/current_division**: "ESG" | "GDT" | "GVC" | "MSG_US"
- **status**: "approval_for_pinning" | "pinned" | "approval_for_assigning" | "assigned" | "up_for_debate" | "peeled" | "available" | "must_keep" | "for_discussion" | "to_be_peeled"

### Cross-Reference Validation
- Manager emails must exist in profiles table
- Account and seller names must match exactly between tabs
- Manager names must exist when referenced in sellers or manager teams

### Business Logic Validation
- Revenue percentages should add up to 100% for each relationship
- Latitude/longitude should be valid coordinates
- Tenure months should be positive numbers

## Error Handling

The comprehensive import function provides detailed error reporting:

- **Per-tab error tracking**: Each tab's import results are tracked separately
- **Dependency validation**: Ensures required data exists before creating relationships
- **Rollback capability**: Failed imports don't leave partial data
- **Audit logging**: All import activities are logged for compliance

## Best Practices

1. **Always use the template**: Download and use the provided template to ensure correct format
2. **Follow import order**: The system handles this automatically, but understanding helps with troubleshooting
3. **Validate data first**: Check that all required fields are populated and valid
4. **Test with small datasets**: Start with a few records to verify the process
5. **Monitor audit logs**: Review import activities for compliance and troubleshooting
6. **Backup before major imports**: Always backup data before large imports

## Troubleshooting

### Common Issues

1. **Manager not found**: Ensure manager email exists in user profiles
2. **Account/Seller name mismatch**: Names must match exactly between tabs
3. **Invalid enum values**: Check that all enum fields use valid values
4. **Missing required fields**: Ensure all required columns are populated
5. **Percentage validation**: Revenue percentages should be 0-100, not decimals

### Debug Information

The import function provides detailed console logging:
- Available sheet names
- Import progress for each tab
- Error details for failed imports
- Final results summary

This comprehensive approach ensures data integrity while providing a user-friendly import experience.
