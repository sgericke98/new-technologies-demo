'use client'

export const dynamic = 'force-dynamic'

import { AppHeader } from "@/components/layout/AppHeader";
import { RequestsContent } from "@/components/requests/RequestsContent";

export default function RequestsPage() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      
      <main className="container mx-auto p-6">
        <RequestsContent />
      </main>
    </div>
  );
}