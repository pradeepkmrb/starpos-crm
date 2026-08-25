import type { TenantRole } from "@digitel/shared";

export interface TenantRequestContext {
  userId: string;
  tenantId: string;
  role: TenantRole;
}

declare module "express" {
  interface Request {
    tenantContext?: TenantRequestContext;
  }
}
