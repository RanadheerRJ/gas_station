import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { developerLogin, onAuthProfile, pinLogin, signOut } from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthProfile((p) => {
      setProfile(p);
      setLoading(false);
    });
    return () => unsub && unsub();
  }, []);

  const value = useMemo(
    () => ({
      profile,
      loading,
      login: (creds) => pinLogin(creds),
      developerLogin: (creds) => developerLogin(creds),
      logout: () => signOut(),
      isAdmin: profile?.role === "admin",
      isOwner: profile?.role === "owner",
      isManager: profile?.role === "manager",
      isAttendant: profile?.role === "attendant",
      canAmend: profile?.role === "owner" || profile?.role === "manager",
    }),
    [profile, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
