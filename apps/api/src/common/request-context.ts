import type { TenantRole } from "@starpos-crm/shared";

export interface TenantRequestContext {
  /** Empty for API-key requests: a key authenticates the workspace, not a person. */
  userId: string;
  tenantId: string;
  role: TenantRole;
  /** Set only when the caller authenticated with an X-API-Key header. */
  apiKeyId?: string;
}

declare module "express" {
  interface Request {
    tenantContext?: TenantRequestContext;
  }
}
