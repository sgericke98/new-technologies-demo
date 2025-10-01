# BAIN Dashboard

A Business Analytics and Intelligence Network dashboard built with Next.js 14, TypeScript, and Supabase.

## Features

- **Role-based Authentication**: MASTER and MANAGER roles with different access levels
- **Seller Management**: View and manage seller accounts with drag-and-drop assignment
- **Revenue Analytics**: Track revenue across different divisions and account sizes
- **Request System**: MANAGER users can request account changes for MASTER approval
- **Data Import**: MASTER users can import Excel files for accounts, sellers, and relationships
- **Real-time Updates**: Live data synchronization with Supabase

## Tech Stack

- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **Database**: Supabase (PostgreSQL)
- **State Management**: React Query + Context API
- **Authentication**: Supabase Auth
- **UI Components**: Radix UI primitives

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Supabase account and project

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd bain-dashboard
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   ```
   
   Edit `.env.local` with your Supabase credentials:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url_here
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key_here
   ```

4. **Set up Supabase database**
   - Create a new Supabase project
   - Run the database migrations (see Database Setup section)
   - Configure Row Level Security (RLS) policies

5. **Start the development server**
   ```bash
   npm run dev
   ```

6. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## Database Setup

### Required Tables

The application requires the following Supabase tables:

- `profiles` - User profiles with roles
- `accounts` - Customer accounts
- `sellers` - Sales representatives
- `managers` - Manager assignments
- `relationship_maps` - Account-seller relationships
- `original_relationships` - Historical relationship snapshots
- `account_revenues` - Revenue data by account
- `requests` - Manager requests for account changes

### RLS Policies

Configure Row Level Security policies to ensure:
- Users can only see their own profile
- MANAGER users can only see assigned sellers
- MASTER users can see all data
- Proper access control for all tables

## Project Structure

```
├── app/                          # Next.js App Router
│   ├── (auth)/                   # Authentication pages
│   ├── (dashboard)/              # Protected dashboard pages
│   ├── globals.css               # Global styles
│   ├── layout.tsx                # Root layout
│   └── page.tsx                  # Home page
├── src/
│   ├── components/               # Reusable components
│   │   ├── dashboard/            # Dashboard-specific components
│   │   ├── layout/               # Layout components
│   │   ├── seller/               # Seller management components
│   │   └── ui/                   # shadcn/ui components
│   ├── contexts/                 # React contexts
│   ├── hooks/                    # Custom hooks
│   ├── integrations/             # External integrations
│   └── lib/                      # Utility functions
├── public/                       # Static assets
└── supabase/                     # Database configuration
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run type-check` - Run TypeScript type checking

## User Roles

### MASTER (CRO)
- Full access to all features
- Can directly assign/unassign accounts
- Can approve/reject manager requests
- Can import data files
- Can view all sellers and accounts

### MANAGER
- Limited to assigned sellers only
- Can create requests for account changes
- Cannot directly assign/unassign accounts
- Cannot access requests page
- Cannot import data

## Features

### Dashboard
- KPI cards showing account counts, revenue, and seller metrics
- Separate views for Enterprise and Midmarket segments
- Seller tiles with revenue and account information
- Data import functionality (MASTER only)

### Seller Management
- Drag-and-drop account assignment
- Pin/unpin accounts for priority
- Revenue tracking and analytics
- Account filtering and search

### Request System
- MANAGER users can request account changes
- MASTER users can approve/reject requests
- Request history and tracking
- Email notifications (if configured)

## Migration from Vite

This project was migrated from React + Vite to Next.js 14. See [MIGRATION_NOTES.md](./MIGRATION_NOTES.md) for detailed migration information.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is proprietary software. All rights reserved.

## Support

For support and questions:
- Check the documentation in `/docs`
- Review the migration notes
- Contact the development team
