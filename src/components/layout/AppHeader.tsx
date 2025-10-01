import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Building2, LogOut, User, Settings } from "lucide-react";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

export function AppHeader() {
  const { profile, signOut } = useAuth();

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-gradient-header shadow-md">
      <div className="container flex h-16 items-center justify-between px-4">
        <Link href="/dashboard" className="flex items-center space-x-2">
          <Building2 className="h-6 w-6 text-primary-foreground" />
          <span className="text-xl font-bold text-primary-foreground">
            Account Reassignment
          </span>
        </Link>

        <nav className="flex items-center space-x-4">
          <Link href="/dashboard">
            <Button variant="ghost" className="text-primary-foreground hover:bg-white/20">
              Dashboard
            </Button>
          </Link>
          {profile?.role === "MASTER" && (
            <Link href="/requests">
              <Button variant="ghost" className="text-primary-foreground hover:bg-white/20">
                Requests
              </Button>
            </Link>
          )}
          {profile?.role === "MASTER" && (
            <Link href="/admin/settings">
              <Button variant="ghost" className="text-primary-foreground hover:bg-white/20">
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Button>
            </Link>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center space-x-2 text-primary-foreground hover:bg-white/20">
                <User className="h-4 w-4" />
                <span>{profile?.name}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">{profile?.name}</p>
                  <p className="text-xs text-muted-foreground">{profile?.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled>
                <Badge variant={profile?.role === "MASTER" ? "default" : "secondary"}>
                  {profile?.role}
                </Badge>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut} className="text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>
      </div>
    </header>
  );
}
