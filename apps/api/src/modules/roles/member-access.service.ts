import { Injectable } from "@nestjs/common";
import {
  FULL_ACCESS,
  normalizePermissions,
  type DataScope,
  type Permissions,
  type TenantRole,
} from "@starpos-crm/shared";
import { PrismaService } from "../../prisma/prisma.service";

export interface MemberAccess {
  role: TenantRole;
  roleId: string | null;
  roleName: string;
  permissions: Permissions;
  dataScope: DataScope;
  /** False = mobile app only. */
  webAccess: boolean;
}

/** How long a looked-up membership is reused; role changes take effect within this window. */
const CACHE_MS = 15_000;

/** The ctx.role a role's data scope maps onto, for the roleAtLeast checks that predate custom roles. */
export function roleForScope(dataScope: DataScope): TenantRole {
  return dataScope === "all" ? "admin" : "agent";
}

/**
 * Resolves what a signed-in person may do in a workspace, fresh from the
 * database rather than from their token — so removing someone or changing
 * their role applies within seconds, not when their token expires.
 */
@Injectable()
export class MemberAccessService {
  private readonly cache = new Map<string, { at: number; access: MemberAccess | null }>();

  constructor(private readonly prisma: PrismaService) {}

  async resolve(tenantId: string, userId: string): Promise<MemberAccess | null> {
    const key = `${tenantId}:${userId}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.access;

    const membership = await this.prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: {
        status: true,
        role: true,
        roleId: true,
        customRole: { select: { name: true, permissions: true, dataScope: true, webAccess: true } },
      },
    });

    let access: MemberAccess | null = null;
    if (membership && membership.status === "active") {
      if (membership.role === "owner") {
        access = {
          role: "owner",
          roleId: null,
          roleName: "Owner",
          permissions: FULL_ACCESS,
          dataScope: "all",
          webAccess: true,
        };
      } else if (membership.customRole) {
        const dataScope: DataScope = membership.customRole.dataScope === "own" ? "own" : "all";
        access = {
          role: roleForScope(dataScope),
          roleId: membership.roleId,
          roleName: membership.customRole.name,
          permissions: normalizePermissions(membership.customRole.permissions),
          dataScope,
          webAccess: membership.customRole.webAccess,
        };
      } else {
        // A member without a role (shouldn't happen after the roles migration) gets nothing.
        access = {
          role: "agent",
          roleId: null,
          roleName: "No role",
          permissions: normalizePermissions(null),
          dataScope: "own",
          webAccess: false,
        };
      }
    }

    this.cache.set(key, { at: Date.now(), access });
    if (this.cache.size > 5_000) this.cache.clear();
    return access;
  }

  /** Drops cached lookups so a change made on this instance applies immediately. */
  forget(tenantId: string, userId?: string) {
    if (userId) {
      this.cache.delete(`${tenantId}:${userId}`);
      return;
    }
    for (const key of this.cache.keys()) if (key.startsWith(`${tenantId}:`)) this.cache.delete(key);
  }
}
