"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { SessionData, AuthUser, clearSession, isSessionValid, refreshSession, importPrivateKeyFromJWK, exportPrivateKeyJWK } from "@/app/lib/auth";

interface AuthContextType {
  session: SessionData | null;
  user: AuthUser | null;
  isLoading: boolean;
  error: string | null;
  setSession: (session: SessionData) => void;
  logout: () => Promise<void>;
  hasPrivateKey: () => boolean;
  refreshTokenIfNeeded: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSessionState] = useState<SessionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check for existing session on mount
  useEffect(() => {
    const checkSession = async () => {
      try {
        const storedSession = sessionStorage.getItem("whisperbox_session");
        if (storedSession) {
          const parsed = JSON.parse(storedSession);
          
          // Verify session is still valid
          if (isSessionValid(parsed)) {
            // Restore the privateKey if it was saved as JWK
            if (parsed.privateKeyJWK) {
              try {
                parsed.privateKey = await importPrivateKeyFromJWK(parsed.privateKeyJWK);
              } catch (e) {
                // Key restoration failed silently
              }
            }
            
            setSessionState(parsed);
            setError(null);
          } else {
            sessionStorage.removeItem("whisperbox_session");
          }
        }
      } catch (err) {
        // Session check failed silently
      } finally {
        setIsLoading(false);
      }
    };

    checkSession();
  }, []);

  const handleSetSession = async (newSession: SessionData) => {
    // Prepare a serializable version of the session for sessionStorage
    const serializableSession = { ...newSession };
    
    if (newSession.privateKey) {
      try {
        // Only attempt export if it's a real CryptoKey instance
        if (typeof window !== 'undefined' && newSession.privateKey instanceof CryptoKey) {
          (serializableSession as any).privateKeyJWK = await exportPrivateKeyJWK(newSession.privateKey);
          // Remove the non-serializable CryptoKey from the storage version
          delete serializableSession.privateKey;
        }
      } catch (e) {
        // Key export failed silently
      }
    }

    setSessionState(newSession);
    
    try {
      sessionStorage.setItem("whisperbox_session", JSON.stringify(serializableSession));
      setError(null);
    } catch (err) {
      // Storage failed silently
    }
  };

  const handleLogout = async () => {
    if (session) {
      await clearSession(session);
    }
    setSessionState(null);
    sessionStorage.removeItem("whisperbox_session");
    setError(null);
  };

  const hasPrivateKeyLoaded = (): boolean => {
    return !!session?.privateKey;
  };

  const refreshTokenIfNeeded = async () => {
    if (session && !isSessionValid(session)) {
      try {
        const updatedSession = await refreshSession(session);
        handleSetSession(updatedSession);
      } catch (err) {
        handleLogout(); // Force logout if refresh fails
      }
    }
  };

  // Set up refresh interval
  useEffect(() => {
    const interval = setInterval(() => {
      refreshTokenIfNeeded();
    }, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [session]);

  const value: AuthContextType = {
    session,
    user: session?.user || null,
    isLoading,
    error,
    setSession: handleSetSession,
    logout: handleLogout,
    hasPrivateKey: hasPrivateKeyLoaded,
    refreshTokenIfNeeded,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
