"use client";

import { createContext, useContext } from "react";
import { canEdit, canView, type AccessModule, type DataScope, type Permissions, type TenantRole } from "@starpos-crm/shared";

export interface AccessState {
  role: TenantRole;
  roleName: string;
  permissions: Permissions;
  dataScope: DataScope;
}

const AccessContext = createContext<AccessState | null>(null);

export const AccessProvider = AccessContext.Provider;

/**
 * What the signed-in person's role allows, from the dashboard layout's /me
 * call. While that is loading every check answers "no", so buttons appear a
 * moment later rather than flashing up and vanishing. The server enforces the
 * same rules — this only shapes what is shown.
 */
export function useAccess() {
  const state = useContext(AccessContext);
  return {
    loaded: state !== null,
    role: state?.role ?? null,
    roleName: state?.roleName ?? "",
    isOwner: state?.role === "owner",
    /** Sees every record rather than only their own (and manages colleagues' records). */
    seesAll: state?.dataScope === "all",
    permissions: state?.permissions ?? null,
    canView: (module: AccessModule) => (state ? canView(state.permissions, module) : false),
    canEdit: (module: AccessModule) => (state ? canEdit(state.permissions, module) : false),
  };
}
