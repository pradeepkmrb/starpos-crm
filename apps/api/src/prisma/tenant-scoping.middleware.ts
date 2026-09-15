import type { Prisma } from "@digitel/db";
import { getCurrentTenantId } from "./tenant-context.store";

/**
 * Safety net, not a guarantee: catches a developer forgetting to filter a
 * top-level query by tenant on one of these models. It does NOT protect
 * nested `include`/`select` relation fetches (Prisma resolves those inside
 * the same query, invisible to this middleware), and it never overrides an
 * explicit tenantId already present in `where` or `data` — some flows (e.g.
 * AuthService.switchTenant) legitimately query a tenant other than the
 * caller's current one. Only fills gaps; never overrides.
 *
 * Runs only when AsyncLocalStorage has a current tenantId, i.e. only for
 * HTTP requests that went through TenantContextMiddleware with a valid
 * token. BullMQ job processors run outside that context and continue to
 * scope their Prisma calls explicitly, same as before this middleware
 * existed.
 */
const TENANT_SCOPED_MODELS = new Set([
  "TenantMembership",
  "TenantInvite",
  "WhatsappChannel",
  "Contact",
  "ContactList",
  "MessageTemplate",
  "Campaign",
  "MessageLog",
  "AutomationWorkflow",
  "Product",
  "Subscription",
  "Invoice",
]);

const WHERE_ACTIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
  "count",
  "aggregate",
  "groupBy",
]);

/**
 * True if `where` already pins a tenantId — either as a plain top-level
 * field, or nested inside a compound-unique key such as
 * `tenantId_userId: { tenantId, userId }` (every compound key in this
 * schema that includes tenantId names it that way). Checking only the
 * top-level field would miss the compound case and inject a second,
 * contradictory top-level tenantId alongside it — exactly the kind of bug
 * that would silently break AuthService.switchTenant.
 */
function whereAlreadyScopesTenant(where: Record<string, unknown>): boolean {
  if (where.tenantId !== undefined) return true;
  return Object.values(where).some(
    (value) => value !== null && typeof value === "object" && !Array.isArray(value) && "tenantId" in value,
  );
}

export function tenantScopingMiddleware(): Prisma.Middleware {
  return (params, next) => {
    const tenantId = getCurrentTenantId();
    if (!tenantId || !params.model || !TENANT_SCOPED_MODELS.has(params.model)) {
      return next(params);
    }

    const args = (params.args ?? {}) as Record<string, unknown>;

    if (WHERE_ACTIONS.has(params.action)) {
      const where = (args.where ?? {}) as Record<string, unknown>;
      if (!whereAlreadyScopesTenant(where)) {
        args.where = { ...where, tenantId };
      }
    } else if (params.action === "upsert") {
      const where = (args.where ?? {}) as Record<string, unknown>;
      if (!whereAlreadyScopesTenant(where)) args.where = { ...where, tenantId };
      const create = (args.create ?? {}) as Record<string, unknown>;
      if (create.tenantId === undefined) args.create = { ...create, tenantId };
    } else if (params.action === "create") {
      const data = (args.data ?? {}) as Record<string, unknown>;
      if (data.tenantId === undefined) args.data = { ...data, tenantId };
    } else if (params.action === "createMany") {
      const data = args.data;
      if (Array.isArray(data)) {
        args.data = data.map((row: Record<string, unknown>) =>
          row.tenantId === undefined ? { ...row, tenantId } : row,
        );
      }
    }

    params.args = args;
    return next(params);
  };
}
