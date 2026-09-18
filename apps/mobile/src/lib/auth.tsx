import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getMe, loadStoredTokens, login as apiLogin, logout as apiLogout, setSignedOutHandler, type Me } from "./api";

interface AuthState {
  /** True until stored tokens have been checked on launch. */
  loading: boolean;
  me: Me | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    setSignedOutHandler(() => setMe(null));
    (async () => {
      try {
        if (await loadStoredTokens()) setMe(await getMe());
      } catch {
        // Expired or revoked session: show the login screen.
        setMe(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const data = await apiLogin(email, password);
    setMe({ user: data.user, tenant: data.tenant, role: data.role });
  }, []);

  const signOut = useCallback(async () => {
    await apiLogout();
    setMe(null);
  }, []);

  const value = useMemo(() => ({ loading, me, signIn, signOut }), [loading, me, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
