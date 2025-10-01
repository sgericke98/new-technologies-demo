# Migration Notes: React + Vite → Next.js App Router

## Summary of Migration

This document outlines the migration from React + Vite to Next.js 14 with App Router, preserving 100% of UI/UX and backend functionality.

## Key Decisions Made

### 1. Rendering Strategy
- **Client Components**: All pages use `'use client'` directive to maintain existing behavior
- **SSR/SSG**: Not implemented to preserve exact client-side behavior
- **Data Fetching**: Maintained React Query for client-side data fetching
- **Rationale**: Preserves existing auth flow and real-time data updates

### 2. Routing Migration
- **App Router Structure**: 
  - `/` → `app/page.tsx` (redirects to dashboard)
  - `/auth` → `app/(auth)/auth/page.tsx`
  - `/dashboard` → `app/(dashboard)/dashboard/page.tsx`
  - `/sellers/[id]` → `app/(dashboard)/sellers/[id]/page.tsx`
  - `/requests` → `app/(dashboard)/requests/page.tsx`
- **Route Groups**: Used `(auth)` and `(dashboard)` for organization
- **Navigation**: Updated `react-router-dom` → `next/navigation`

### 3. Authentication
- **Preserved**: Supabase client-side auth with localStorage
- **Context**: Updated AuthContext to use Next.js router
- **Protected Routes**: Converted to client components with useEffect redirects
- **Middleware**: Basic middleware for static file handling

### 4. State Management
- **React Query**: Preserved for data fetching
- **Context**: AuthContext updated for Next.js
- **Local State**: All useState/useEffect patterns maintained

### 5. Styling System
- **Tailwind CSS**: Preserved with updated content paths
- **CSS Variables**: Maintained design system
- **Global Styles**: Moved to `app/globals.css`
- **Component Styling**: No changes to component styles

### 6. Environment Variables
- **Migration**: 
  - `VITE_SUPABASE_URL` → `NEXT_PUBLIC_SUPABASE_URL`
  - `VITE_SUPABASE_PUBLISHABLE_KEY` → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- **Client Access**: All variables prefixed with `NEXT_PUBLIC_`

### 7. Build Configuration
- **Next.js Config**: Basic configuration with path aliases
- **TypeScript**: Updated for Next.js compatibility
- **Package Manager**: Maintained npm
- **Scripts**: Updated to Next.js commands

## Behavioral Differences

**None** - The migration preserves identical behavior:
- Same authentication flow
- Same data fetching patterns
- Same UI/UX
- Same routing behavior
- Same error handling

## Local Development

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your Supabase credentials

# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Environment Variable Mapping

| Old (Vite) | New (Next.js) | Description |
|------------|---------------|-------------|
| `VITE_SUPABASE_URL` | `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase anon key |

## File Structure Changes

### Before (Vite)
```
src/
├── App.tsx
├── main.tsx
├── pages/
├── components/
├── contexts/
└── integrations/
```

### After (Next.js)
```
app/
├── layout.tsx
├── page.tsx
├── globals.css
├── (auth)/auth/page.tsx
├── (dashboard)/
│   ├── dashboard/page.tsx
│   ├── sellers/[id]/page.tsx
│   └── requests/page.tsx
├── loading.tsx
├── error.tsx
└── not-found.tsx
src/
├── components/
├── contexts/
├── hooks/
├── integrations/
└── lib/
```

## Performance Considerations

- **Bundle Size**: Similar to Vite build
- **Code Splitting**: Maintained via Next.js automatic splitting
- **Image Optimization**: Available via `next/image` (not implemented to preserve behavior)
- **Caching**: Maintained React Query caching strategy

## Testing

- **Unit Tests**: No existing tests to migrate
- **E2E Tests**: No existing tests to migrate
- **Manual Testing**: All functionality preserved

## Deployment

- **Build Command**: `npm run build`
- **Start Command**: `npm start`
- **Static Export**: Not applicable (requires server for Supabase)
- **Environment**: Requires Node.js runtime

## Rollback Plan

If issues arise:
1. Revert to original Vite configuration
2. Restore original `src/App.tsx` and routing
3. Update environment variables back to Vite format
4. Restore original package.json scripts

## Support

For issues with the migration:
1. Check environment variables are correctly set
2. Verify Supabase configuration
3. Check browser console for client-side errors
4. Verify all imports are using correct Next.js patterns
