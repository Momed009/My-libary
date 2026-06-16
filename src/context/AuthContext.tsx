import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/services/supabase';
import { Session, User } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AUTH_SKIPPED_KEY = 'auth_skipped';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  authSkipped: boolean;
  setAuthSkipped: (val: boolean) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  signUpWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authSkipped, setAuthSkippedState] = useState<boolean>(false);

  useEffect(() => {
    // Load auth skipped state on mount
    AsyncStorage.getItem(AUTH_SKIPPED_KEY).then((val) => {
      setAuthSkippedState(val === 'true');
    });

    // Get the current session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const setAuthSkipped = async (val: boolean) => {
    await AsyncStorage.setItem(AUTH_SKIPPED_KEY, val ? 'true' : 'false');
    setAuthSkippedState(val);
  };

  const signInWithEmail = async (email: string, password: string): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) return { error: error.message };
    // Clear skipped state upon successful sign in
    await setAuthSkipped(false);
    return { error: null };
  };

  const signUpWithEmail = async (email: string, password: string): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    if (error) return { error: error.message };
    // Clear skipped state upon successful sign up
    await setAuthSkipped(false);
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    // Reset skipped state to false so they see the login screen again
    await setAuthSkipped(false);
  };

  return (
    <AuthContext.Provider value={{
      user,
      session,
      isLoading,
      authSkipped,
      setAuthSkipped,
      signInWithEmail,
      signUpWithEmail,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
