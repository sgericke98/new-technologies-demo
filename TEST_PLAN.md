# Test Plan: Next.js Migration

## Manual Testing Checklist

### 1. Authentication Flow
- [ ] **Sign Up**
  - [ ] Create new account with MANAGER role
  - [ ] Create new account with MASTER role
  - [ ] Verify email confirmation flow
  - [ ] Check role-based access restrictions

- [ ] **Sign In**
  - [ ] Sign in with valid credentials
  - [ ] Verify redirect to dashboard after sign in
  - [ ] Test invalid credentials error handling
  - [ ] Test sign out functionality

### 2. Navigation & Routing
- [ ] **Home Page**
  - [ ] Visit `/` - should redirect to `/dashboard`
  - [ ] Verify redirect works for authenticated users

- [ ] **Authentication Pages**
  - [ ] Visit `/auth` - should show login/signup form
  - [ ] Verify form validation works
  - [ ] Test tab switching between sign in/sign up

- [ ] **Dashboard**
  - [ ] Visit `/dashboard` - should show main dashboard
  - [ ] Verify KPI cards display correctly
  - [ ] Test Enterprise/Midmarket tabs
  - [ ] Verify seller tiles display and link correctly

- [ ] **Seller Detail**
  - [ ] Visit `/sellers/[id]` - should show seller detail page
  - [ ] Verify drag-and-drop functionality
  - [ ] Test account assignment/unassignment
  - [ ] Test pin/unpin functionality
  - [ ] Verify role-based permissions

- [ ] **Requests (MASTER only)**
  - [ ] Visit `/requests` as MASTER - should show requests page
  - [ ] Visit `/requests` as MANAGER - should redirect to dashboard
  - [ ] Test approve/reject functionality

### 3. Data Fetching & State Management
- [ ] **React Query Integration**
  - [ ] Verify data loads correctly on page refresh
  - [ ] Test query invalidation after mutations
  - [ ] Check loading states display properly
  - [ ] Verify error handling for failed requests

- [ ] **Supabase Integration**
  - [ ] Test real-time auth state changes
  - [ ] Verify profile data loads correctly
  - [ ] Test database queries work as expected
  - [ ] Check RLS policies still work

### 4. UI/UX Components
- [ ] **Styling**
  - [ ] Verify all Tailwind classes work correctly
  - [ ] Check dark/light mode support
  - [ ] Verify custom CSS variables are applied
  - [ ] Test responsive design on different screen sizes

- [ ] **Components**
  - [ ] Test all shadcn/ui components work
  - [ ] Verify form validation and error states
  - [ ] Check toast notifications display
  - [ ] Test dropdown menus and modals

- [ ] **Drag & Drop**
  - [ ] Test account dragging between columns
  - [ ] Verify visual feedback during drag
  - [ ] Check drop zones work correctly
  - [ ] Test disabled states for locked accounts

### 5. Role-Based Access Control
- [ ] **MANAGER Role**
  - [ ] Can view assigned sellers only
  - [ ] Cannot access `/requests` page
  - [ ] Can create requests for account changes
  - [ ] Cannot directly assign/unassign accounts

- [ ] **MASTER Role**
  - [ ] Can view all sellers
  - [ ] Can access `/requests` page
  - [ ] Can directly assign/unassign accounts
  - [ ] Can approve/reject requests
  - [ ] Can import data files

### 6. Error Handling
- [ ] **404 Pages**
  - [ ] Visit non-existent route - should show 404 page
  - [ ] Test 404 page has working "Return to Home" link

- [ ] **Error Boundaries**
  - [ ] Test error.tsx catches component errors
  - [ ] Verify error page displays correctly
  - [ ] Check "Try again" button works

- [ ] **Loading States**
  - [ ] Test loading.tsx displays during navigation
  - [ ] Verify loading spinners show correctly
  - [ ] Check loading states don't cause layout shift

### 7. Performance
- [ ] **Page Load Times**
  - [ ] Measure initial page load time
  - [ ] Test navigation between pages
  - [ ] Verify code splitting works correctly

- [ ] **Bundle Size**
  - [ ] Check build output size
  - [ ] Verify no significant size increase
  - [ ] Test production build works correctly

## Automated Testing Commands

### Development Server
```bash
# Start development server
npm run dev

# Check for TypeScript errors
npm run type-check

# Run linting
npm run lint
```

### Production Build
```bash
# Build for production
npm run build

# Start production server
npm start

# Test production build locally
npm run build && npm start
```

### Environment Setup
```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your Supabase credentials
```

## Browser Testing

### Desktop Browsers
- [ ] **Chrome** (latest)
- [ ] **Firefox** (latest)
- [ ] **Safari** (latest)
- [ ] **Edge** (latest)

### Mobile Browsers
- [ ] **Chrome Mobile**
- [ ] **Safari Mobile**
- [ ] **Firefox Mobile**

### Screen Sizes
- [ ] **Desktop** (1920x1080)
- [ ] **Laptop** (1366x768)
- [ ] **Tablet** (768x1024)
- [ ] **Mobile** (375x667)

## Performance Testing

### Lighthouse Scores
- [ ] **Performance** - Should maintain similar scores
- [ ] **Accessibility** - Should maintain similar scores
- [ ] **Best Practices** - Should maintain similar scores
- [ ] **SEO** - Should maintain similar scores

### Core Web Vitals
- [ ] **LCP** (Largest Contentful Paint) - < 2.5s
- [ ] **FID** (First Input Delay) - < 100ms
- [ ] **CLS** (Cumulative Layout Shift) - < 0.1

## Regression Testing

### Data Integrity
- [ ] **Database Operations**
  - [ ] Account assignments work correctly
  - [ ] Revenue calculations are accurate
  - [ ] User roles are preserved
  - [ ] Data imports work correctly

- [ ] **State Persistence**
  - [ ] Auth state persists across page refreshes
  - [ ] User preferences are maintained
  - [ ] Form data is preserved during navigation

### Feature Parity
- [ ] **All Original Features**
  - [ ] Dashboard KPIs display correctly
  - [ ] Seller management works
  - [ ] Account assignment flows
  - [ ] Request/approval system
  - [ ] Data import functionality

## Rollback Testing

### Quick Rollback
- [ ] **Environment Variables**
  - [ ] Revert to Vite env vars
  - [ ] Test original app still works

- [ ] **Code Reversion**
  - [ ] Restore original App.tsx
  - [ ] Restore original routing
  - [ ] Verify original functionality

## Success Criteria

### Must Have
- [ ] All pages load without errors
- [ ] Authentication works correctly
- [ ] Data fetching works as expected
- [ ] UI/UX is identical to original
- [ ] All user flows work end-to-end

### Should Have
- [ ] Performance is similar or better
- [ ] No console errors
- [ ] All features work on mobile
- [ ] Build process works correctly

### Nice to Have
- [ ] Improved performance
- [ ] Better error handling
- [ ] Enhanced developer experience
- [ ] Future-proof architecture

## Test Data Requirements

### Supabase Setup
- [ ] **Test Database**
  - [ ] Sample accounts data
  - [ ] Sample sellers data
  - [ ] Sample relationship maps
  - [ ] Test user profiles

### Test Users
- [ ] **MASTER User**
  - [ ] Email: master@test.com
  - [ ] Role: MASTER
  - [ ] Full access to all features

- [ ] **MANAGER User**
  - [ ] Email: manager@test.com
  - [ ] Role: MANAGER
  - [ ] Limited access to assigned sellers

## Issue Tracking

### Known Issues
- None identified during migration

### Potential Issues
- [ ] Environment variable configuration
- [ ] Supabase client initialization
- [ ] Route parameter handling
- [ ] Component hydration mismatches

### Resolution Process
1. Document issue with steps to reproduce
2. Identify root cause (Vite vs Next.js difference)
3. Implement fix maintaining original behavior
4. Test fix thoroughly
5. Update documentation if needed
