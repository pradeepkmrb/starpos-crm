import { SetMetadata } from "@nestjs/common";
import type { TenantRole } from "@starpos-crm/shared";

export const ROLES_KEY = "requiredRole";

/** Requires the caller's role to be at least `minimum` in the owner > admin > agent > viewer hierarchy. */
export const Roles = (minimum: TenantRole) => SetMetadata(ROLES_KEY, minimum);
