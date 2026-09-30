import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  getMe,
  loadStoredTokens,
  login as apiLogin,
  logout as apiLogout,
  setSignedOutHandler,
  updateMe,
  type Me,
} from "./api";
import { registerForPush, unregisterForPush } from "./push";

interface AuthState {
  /** True until stored tokens have been checked on launch. */
  loading: boolean;
  me: Me | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Saves the signed-in user's own name or photo and refreshes `me`. */
  saveProfile: (input: { name?: string; avatarUrl?: string | null }) => Promise<void>;
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
    setMe({
      user: data.user,
      tenant: data.tenant,
      role: data.role,
      roleName: data.roleName,
      permissions: data.permissions,
      dataScope: data.dataScope,
      webAccess: data.webAccess,
    });
  }, []);

  // Once someone is signed in, make sure this phone gets their notifications.
  const userId = me?.user.id;
  useEffect(() => {
    if (userId) registerForPush().catch(() => undefined);
  }, [userId]);

  const signOut = useCallback(async () => {
    // Unregister while the session still exists — the call needs it.
    await unregisterForPush();
    await apiLogout();
    setMe(null);
  }, []);

  const saveProfile = useCallback(async (input: { name?: string; avatarUrl?: string | null }) => {
    setMe(await updateMe(input));
  }, []);

  const value = useMemo(() => ({ loading, me, signIn, signOut, saveProfile }), [loading, me, signIn, signOut, saveProfile]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
