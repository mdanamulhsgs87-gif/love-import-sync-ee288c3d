import { createContext, useContext } from "react";
import type { User as AppUser } from "@/lib/api";

export type AuthContextValue = {
  user: AppUser | null;
  isLoading: boolean;
  isLoggingIn: boolean;
  isAuthenticated: boolean;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
