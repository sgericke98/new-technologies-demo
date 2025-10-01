'use client'

import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireRole?: "MASTER" | "MANAGER";
}

export function ProtectedRoute({ children, requireRole }: ProtectedRouteProps) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user || !profile) {
        router.push("/auth");
        return;
      }

      if (requireRole && profile.role !== requireRole) {
        router.push("/dashboard");
        return;
      }
    }
  }, [user, profile, loading, requireRole, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !profile) {
    return null; // Will redirect
  }

  if (requireRole && profile.role !== requireRole) {
    return null; // Will redirect
  }

  return <>{children}</>;
}