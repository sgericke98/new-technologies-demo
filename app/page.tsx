import { redirect } from 'next/navigation'

export default function HomePage() {
  // Redirect to dashboard (same behavior as original)
  redirect('/dashboard')
}
