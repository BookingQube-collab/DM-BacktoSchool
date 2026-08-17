import { createContext, useContext } from "react";
import {
  navKeysForRole,
  type AdminNavKey,
  type AdminRole,
} from "@/lib/admin-roles";

export type AdminSession = {
  username: string;
  role: AdminRole;
  pages: AdminNavKey[];
};

export const AdminSessionContext = createContext<AdminSession | null>(null);

export function useAdminSession(): AdminSession {
  return (
    useContext(AdminSessionContext) ?? {
      username: "admin",
      role: "admin",
      pages: [...navKeysForRole("admin")],
    }
  );
}
