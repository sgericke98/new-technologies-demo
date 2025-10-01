# Route Mapping: Vite → Next.js App Router

## Route Translation Table

| Original Route (React Router) | New Route (Next.js App Router) | File Location | Notes |
|-------------------------------|--------------------------------|---------------|-------|
| `/` | `/` | `app/page.tsx` | Redirects to `/dashboard` |
| `/auth` | `/auth` | `app/(auth)/auth/page.tsx` | Authentication page |
| `/dashboard` | `/dashboard` | `app/(dashboard)/dashboard/page.tsx` | Main dashboard |
| `/sellers/:id` | `/sellers/[id]` | `app/(dashboard)/sellers/[id]/page.tsx` | Seller detail page |
| `/requests` | `/requests` | `app/(dashboard)/requests/page.tsx` | Requests management (MASTER only) |
| `*` (catch-all) | `not-found` | `app/not-found.tsx` | 404 page |

## Route Groups

### `(auth)` Group
- Contains authentication-related pages
- No layout wrapper applied
- Used for organization only

### `(dashboard)` Group  
- Contains protected dashboard pages
- No layout wrapper applied
- Used for organization only

## Dynamic Routes

| Pattern | Next.js Implementation | Example |
|---------|------------------------|---------|
| `/sellers/:id` | `/sellers/[id]` | `/sellers/123` |
| N/A | `[...slug]` | Not used |

## Route Protection

### Before (React Router)
```tsx
<Route
  path="/dashboard"
  element={
    <ProtectedRoute>
      <Dashboard />
    </ProtectedRoute>
  }
/>
```

### After (Next.js App Router)
```tsx
// In page component
export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <Dashboard />
    </ProtectedRoute>
  );
}
```

## Navigation Updates

### Before (React Router)
```tsx
import { Link, useNavigate } from "react-router-dom";

<Link to="/dashboard">Dashboard</Link>
navigate("/dashboard");
```

### After (Next.js)
```tsx
import Link from "next/link";
import { useRouter } from "next/navigation";

<Link href="/dashboard">Dashboard</Link>
router.push("/dashboard");
```

## Route Parameters

### Before (React Router)
```tsx
import { useParams } from "react-router-dom";

const { id } = useParams();
```

### After (Next.js)
```tsx
import { useParams } from "next/navigation";

const params = useParams();
const id = params.id as string;
```

## Query Parameters

### Before (React Router)
```tsx
import { useSearchParams } from "react-router-dom";

const [searchParams] = useSearchParams();
const query = searchParams.get("q");
```

### After (Next.js)
```tsx
import { useSearchParams } from "next/navigation";

const searchParams = useSearchParams();
const query = searchParams.get("q");
```

## Route Guards

### Before (React Router)
```tsx
<Route
  path="/requests"
  element={
    <ProtectedRoute requireRole="MASTER">
      <Requests />
    </ProtectedRoute>
  }
/>
```

### After (Next.js)
```tsx
// In app/(dashboard)/requests/page.tsx
export default function RequestsPage() {
  return (
    <ProtectedRoute requireRole="MASTER">
      <Requests />
    </ProtectedRoute>
  );
}
```

## Redirects

### Before (React Router)
```tsx
<Route path="/" element={<Navigate to="/dashboard" replace />} />
```

### After (Next.js)
```tsx
// In app/page.tsx
import { redirect } from 'next/navigation'

export default function HomePage() {
  redirect('/dashboard')
}
```

## Error Handling

### Before (React Router)
```tsx
<Route path="*" element={<NotFound />} />
```

### After (Next.js)
```tsx
// app/not-found.tsx
export default function NotFound() {
  return <NotFoundComponent />
}
```

## Layouts

### Before (React Router)
```tsx
<BrowserRouter>
  <AuthProvider>
    <Routes>
      <Route path="/dashboard" element={<Dashboard />} />
    </Routes>
  </AuthProvider>
</BrowserRouter>
```

### After (Next.js)
```tsx
// app/layout.tsx
export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
```

## Route Metadata

### Before (React Router)
- No built-in metadata support
- Used React Helmet for SEO

### After (Next.js)
```tsx
// In page.tsx
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Business Analytics Dashboard',
}
```

## Performance Considerations

- **Code Splitting**: Automatic with Next.js App Router
- **Prefetching**: Automatic for Link components
- **Loading States**: Built-in loading.tsx support
- **Error Boundaries**: Built-in error.tsx support
