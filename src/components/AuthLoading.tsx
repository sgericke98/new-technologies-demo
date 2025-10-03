'use client'

import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

export function AuthLoading() {
  const { loading, user } = useAuth();

  if (!loading) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}
