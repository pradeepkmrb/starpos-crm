import type { DataScope, Permissions, TenantRole } from "@starpos-crm/shared";

export interface TenantRequestContext {
  /** Empty for API-key requests: a key authenticates the workspace, not a person. */
  userId: string;
  tenantId: string;
  /**
   * "owner" for the workspace owner. For everyone else it mirrors their
   * role's data scope — "admin" sees all records, "agent" only their own —
   * and is what the older roleAtLeast(...) checks still read.
   */
  role: TenantRole;
  /** Menu access from the person's workspace role; everything for the owner and API keys. */
  permissions: Permissions;
  dataScope: DataScope;
  /** Which app the session belongs to; tokens from before this existed count as web. */
  client?: "web" | "mobile";
  /** Set only when the caller authenticated with an X-API-Key header. */
  apiKeyId?: string;
}

declare module "express" {
  interface Request {
    tenantContext?: TenantRequestContext;
  }
}
