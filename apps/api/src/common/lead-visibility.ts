import type { Prisma } from "@starpos-crm/db";
import type { TenantRequestContext } from "./request-context";

/**
 * A role with the "own" data scope works its own book: leads assigned to the
 * person plus unassigned ones (so they can pick new leads up), never a
 * colleague's. "All" scope — and the owner — see every lead.
 */
export function visibleLeadsWhere(ctx: Pick<TenantRequestContext, "dataScope" | "userId">): Prisma.LeadWhereInput {
  if (ctx.dataScope !== "own" || !ctx.userId) return {};
  return { OR: [{ ownerUserId: ctx.userId }, { ownerUserId: null }] };
}

/** The same rule for rows hanging off a lead (activities, quotations, payments). */
export function visibleViaLead(ctx: Pick<TenantRequestContext, "dataScope" | "userId">): { lead?: Prisma.LeadWhereInput } {
  const where = visibleLeadsWhere(ctx);
  return Object.keys(where).length ? { lead: where } : {};
}
