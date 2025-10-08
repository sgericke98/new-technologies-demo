'use client'

import { createContext, useContext, useEffect, useState, useRef } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useRouter } from "next/navigation";

interface Profile {
  id: string;
  email: string;
  name: string;
  role: "MASTER" | "MANAGER";
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const isAuthenticated = useRef(false);

  useEffect(() => {
    let mounted = true;
    let profileFetched = false;
    
    // Set a timeout to redirect to login if no session is established
    const loadingTimeout = setTimeout(() => {
      if (mounted && !isAuthenticated.current) {
        router.push('/auth');
      }
    }, 8000); // 8 second timeout

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;
        
        setSession(session);
        setUser(session?.user ?? null);
        
        // Update authentication status
        isAuthenticated.current = !!session?.user;
        
        if (session?.user && !profileFetched) {
          // Fetch profile and wait for it before setting loading to false
          profileFetched = true;
          
          // Await profile fetch before setting loading to false
          supabase
            .from("profiles")
            .select("*")
            .eq("id", session.user.id)
            .maybeSingle()
            .then(({ data: profileData, error }) => {
              if (!mounted) return;
              
              if (error) {
                // Still set loading to false even on error
              } else {
                setProfile(profileData);
              }
              
              // Set loading to false AFTER profile is fetched (or failed)
              setLoading(false);
              clearTimeout(loadingTimeout);
            });
        } else if (!session?.user) {
          setProfile(null);
          profileFetched = false;
          // If no session, redirect to login
          router.push('/auth');
          return;
        } else {
          // User exists but profile already fetched, set loading to false
          setLoading(false);
          clearTimeout(loadingTimeout);
        }
      }
    );

    // Check for existing session
    const initializeAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          router.push('/auth');
          return;
        }
        
        if (!mounted) return;
        
        setSession(session);
        setUser(session?.user ?? null);
        
        // Update authentication status
        isAuthenticated.current = !!session?.user;
        
        if (session?.user) {
          // Fetch profile and wait for it before setting loading to false
          
          // Await profile fetch before setting loading to false
          const { data: profileData, error: profileError } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", session.user.id)
            .maybeSingle();
          
          if (!mounted) return;
          
          if (profileError) {
            // Still set loading to false even on error
          } else {
            setProfile(profileData);
          }
        }
        
        // Set loading to false AFTER profile is fetched (or failed, or no user)
        setLoading(false);
        clearTimeout(loadingTimeout);
      } catch (error) {
        router.push('/auth');
        return;
      }
    };

    initializeAuth();

    return () => {
      mounted = false;
      clearTimeout(loadingTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    if (!error) {
      router.push("/dashboard");
    }
    
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push("/auth");
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
