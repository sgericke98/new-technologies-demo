'use client'

import { Toaster } from "@/components/ui/toaster"
import { Toaster as Sonner } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { AuthProvider } from "@/contexts/AuthContext"
import { useImportCompletion } from "@/hooks/use-import-completion"
import { useState } from "react"

function ImportCompletionListener() {
  useImportCompletion();
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <ImportCompletionListener />
          {children}
          <Toaster />
          <Sonner />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  )
}
