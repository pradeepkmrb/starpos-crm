import type { TenantRole } from "./types";

/** Ordered lowest to highest privilege. */
export const ROLE_HIERARCHY: TenantRole[] = ["viewer", "agent", "admin", "owner"];

export function roleAtLeast(role: TenantRole, minimum: TenantRole): boolean {
  return ROLE_HIERARCHY.indexOf(role) >= ROLE_HIERARCHY.indexOf(minimum);
}
