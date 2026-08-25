import { AsyncLocalStorage } from "async_hooks";

/**
 * Carries the current request's tenantId across the async call chain so the
 * Prisma tenant-scoping middleware (see tenant-scoping.middleware.ts) can
 * enforce it without every service having to pass it explicitly. Populated
 * by TenantContextMiddleware for the HTTP request lifecycle only — BullMQ
 * job processors run outside any HTTP request and so have no ALS context,
 * which is why they still scope their Prisma calls explicitly.
 */
export const tenantContextStore = new AsyncLocalStorage<{ tenantId: string }>();

export function getCurrentTenantId(): string | undefined {
  return tenantContextStore.getStore()?.tenantId;
}
