# BAIN Database Relationships Diagram

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│    profiles     │    │    managers     │    │    sellers      │
│                 │    │                 │    │                 │
│ • id (PK)       │◄───│ • user_id (FK)  │◄───│ • manager_id    │
│ • email         │    │ • name          │    │ • name          │
│ • name          │    │ • id (PK)       │    │ • division      │
│ • role          │    │                 │    │ • size          │
│ • created_at    │    │                 │    │ • industry_spec │
└─────────────────┘    └─────────────────┘    │ • state/city    │
                                              │ • lat/lng       │
                                              │ • tenure_months │
                                              │ • book_finalized│
                                              └─────────────────┘
                                                       │
                                                       │
┌─────────────────┐    ┌─────────────────┐           │
│    accounts     │    │ relationship_    │◄──────────┘
│                 │    │ maps            │
│ • id (PK)       │◄───│                 │
│ • name          │    │ • account_id    │
│ • industry      │    │ • seller_id     │
│ • size          │    │ • pct_esg       │
│ • state/city    │    │ • pct_gdt       │
│ • lat/lng       │    │ • pct_gvc       │
│ • current_div   │    │ • pct_msg_us    │
│ • created_at    │    │ • status        │
└─────────────────┘    │ • last_actor_id │
        │               │ • updated_at    │
        │               └─────────────────┘
        │
        │
┌─────────────────┐    ┌─────────────────┐
│ account_revenues│    │ original_       │
│                 │    │ relationships   │
│ • account_id    │    │                 │
│ • revenue_esg   │    │ • account_id    │
│ • revenue_gdt   │    │ • seller_id     │
│ • revenue_gvc   │    │ • pct_esg       │
│ • revenue_msg_us│    │ • pct_gdt       │
└─────────────────┘    │ • pct_gvc       │
                       │ • pct_msg_us    │
                       │ • created_at    │
                       └─────────────────┘

┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│    requests     │    │   audit_logs    │    │ threshold_      │
│                 │    │                 │    │ settings        │
│ • account_id    │    │ • user_id       │    │                 │
│ • requester_id  │    │ • entity        │    │ • account_      │
│ • target_seller │    │ • action        │    │   threshold    │
│ • type          │    │ • before/after   │    │ • revenue_      │
│ • status        │    │ • created_at    │    │   threshold     │
│ • payload       │    │                 │    │ • created_at    │
└─────────────────┘    └─────────────────┘    │ • updated_at    │
                                              └─────────────────┘
```

## Key Relationships

### Primary Relationships
1. **profiles** ←→ **managers** (1:1 via user_id)
2. **managers** ←→ **sellers** (1:many via manager_id)
3. **accounts** ←→ **relationship_maps** (1:many via account_id)
4. **sellers** ←→ **relationship_maps** (1:many via seller_id)
5. **accounts** ←→ **account_revenues** (1:1 via account_id)

### Supporting Relationships
6. **profiles** ←→ **audit_logs** (1:many via user_id)
7. **accounts** ←→ **requests** (1:many via account_id)
8. **sellers** ←→ **requests** (1:many via target_seller_id)

## Import Dependencies

```
1. profiles (users must exist first)
   ↓
2. managers (requires profiles)
   ↓
3. accounts (independent)
   ↓
4. sellers (requires managers)
   ↓
5. relationship_maps (requires accounts + sellers)
   ↓
6. manager_team (requires managers + sellers)
```

## Data Flow

```
User Registration → profiles
Manager Setup → managers (linked to profiles)
Account Creation → accounts + account_revenues
Seller Creation → sellers (linked to managers)
Relationship Setup → relationship_maps + original_relationships
Team Assignment → manager_team (updates sellers.manager_id)
```

## Excel Template Structure

```
BAIN_Data_Import_Template.xlsx
├── Instructions (Tab 1)
├── Accounts (Tab 2) → accounts + account_revenues
├── Sellers (Tab 3) → sellers
├── Managers (Tab 4) → managers
├── Relationship_Map (Tab 5) → relationship_maps + original_relationships
└── Manager_Team (Tab 6) → updates sellers.manager_id
```
