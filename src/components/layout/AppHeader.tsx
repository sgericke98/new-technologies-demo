import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Building2, LogOut, User, Settings } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
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
    <header className="sticky top-0 z-50 w-full border-b border-slate-200/60 bg-white/95 backdrop-blur-sm shadow-sm">
      <div className="container mx-auto flex h-20 items-center justify-between px-6">
        <Link href="/dashboard" className="flex items-center group">
          <div className="flex items-center justify-center group-hover:scale-105 transition-all duration-200">
            <Image
              src="/logo-2.png"
              alt="New Era Logo"
              width={150}
              height={150}
              className="object-contain"
            />
          </div>
        </Link>

        <nav className="flex items-center space-x-2">
          <Link href="/dashboard">
            <Button 
              variant="ghost" 
              className="h-10 px-4 text-slate-700 hover:text-slate-900 hover:bg-slate-100 font-medium transition-colors duration-200"
            >
              Dashboard
            </Button>
          </Link>
          {profile?.role === "MASTER" && (
            <Link href="/admin/settings">
              <Button 
                variant="ghost" 
                className="h-10 px-4 text-slate-700 hover:text-slate-900 hover:bg-slate-100 font-medium transition-colors duration-200"
              >
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Button>
            </Link>
          )}

          <div className="ml-4 pl-4 border-l border-slate-200">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  className="flex items-center space-x-3 h-10 px-3 text-slate-700 hover:text-slate-900 hover:bg-slate-100 font-medium transition-colors duration-200"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100">
                    <User className="h-4 w-4" />
                  </div>
                  <div className="flex flex-col items-start">
                    <span className="text-sm font-medium">{profile?.name}</span>
                    <span className="text-xs text-slate-500">{profile?.role}</span>
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 z-50" sideOffset={8}>
                <DropdownMenuLabel className="pb-2">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-semibold text-slate-900">{profile?.name}</p>
                    <p className="text-xs text-slate-500">{profile?.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled className="py-3">
                  <div className="flex items-center justify-between w-full">
                    <span className="text-sm text-slate-600">Role</span>
                    <Badge variant={profile?.role === "MASTER" ? "default" : "secondary"} className="text-xs">
                      {profile?.role}
                    </Badge>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut} className="text-red-600 hover:text-red-700 hover:bg-red-50 py-3">
                  <LogOut className="mr-3 h-4 w-4" />
                  <span className="font-medium">Sign Out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </nav>
      </div>
    </header>
  );
}
