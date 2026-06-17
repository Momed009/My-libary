import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
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
    // Load session and auth-skipped state in parallel
    Promise.all([
      supabase.auth.getSession().catch((err) => {
        console.error('Error getting session:', err);
        return { data: { session: null } };
      }),
      AsyncStorage.getItem(AUTH_SKIPPED_KEY).catch((err) => {
        console.error('Error loading auth skipped state:', err);
        return null;
      }),
    ])
      .then(([sessionResult, skippedValue]) => {
        const currentSession = sessionResult.data.session;
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
        setAuthSkippedState(skippedValue === 'true');
      })
      .catch((err) => {
        console.error('Unexpected error during auth initialization:', err);
        setUser(null);
        setSession(null);
      })
      .finally(() => {
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

  const setAuthSkipped = useCallback(async (val: boolean) => {
    try {
      await AsyncStorage.setItem(AUTH_SKIPPED_KEY, val ? 'true' : 'false');
      setAuthSkippedState(val);
    } catch (err) {
      console.error('Error saving auth skipped state:', err);
    }
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) return { error: error.message };
    // Clear skipped state upon successful sign in
    await setAuthSkipped(false);
    return { error: null };
  }, [setAuthSkipped]);

  const signUpWithEmail = useCallback(async (email: string, password: string): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    if (error) return { error: error.message };
    // Clear skipped state upon successful sign up
    await setAuthSkipped(false);
    return { error: null };
  }, [setAuthSkipped]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    // Reset skipped state to false so they see the login screen again
    await setAuthSkipped(false);
  }, [setAuthSkipped]);

  const contextValue = useMemo(() => ({
    user,
    session,
    isLoading,
    authSkipped,
    setAuthSkipped,
    signInWithEmail,
    signUpWithEmail,
    signOut,
  }), [user, session, isLoading, authSkipped, setAuthSkipped, signInWithEmail, signUpWithEmail, signOut]);

  return (
    <AuthContext.Provider value={contextValue}>
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
