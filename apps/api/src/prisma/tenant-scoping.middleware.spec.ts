import { tenantContextStore } from "./tenant-context.store";
import { tenantScopingMiddleware } from "./tenant-scoping.middleware";
import type { Prisma } from "@digitel/db";

describe("tenantScopingMiddleware", () => {
  const middleware = tenantScopingMiddleware();
  const runNext = jest.fn((params: Prisma.MiddlewareParams) => Promise.resolve(params));

  beforeEach(() => runNext.mockClear());

  function callWithContext<T>(tenantId: string | undefined, fn: () => T): T {
    if (tenantId === undefined) return fn();
    return tenantContextStore.run({ tenantId }, fn);
  }

  it("injects tenantId into a findMany where clause missing one", async () => {
    await callWithContext("tenant-a", () =>
      middleware(
        { model: "Contact", action: "findMany", args: { where: {} }, dataPath: [], runInTransaction: false },
        runNext,
      ),
    );
    expect(runNext.mock.calls[0][0].args.where).toEqual({ tenantId: "tenant-a" });
  });

  it("does NOT override an explicit tenantId for a different tenant", async () => {
    // Mirrors AuthService.switchTenant: authenticated as tenant-a but
    // legitimately looking up a membership row for tenant-b.
    await callWithContext("tenant-a", () =>
      middleware(
        {
          model: "TenantMembership",
          action: "findUnique",
          args: { where: { tenantId_userId: { tenantId: "tenant-b", userId: "u1" } } },
          dataPath: [],
          runInTransaction: false,
        },
        runNext,
      ),
    );
    // No top-level where.tenantId was added — the compound key's tenant-b stands.
    expect(runNext.mock.calls[0][0].args.where.tenantId).toBeUndefined();
    expect(runNext.mock.calls[0][0].args.where.tenantId_userId.tenantId).toBe("tenant-b");
  });

  it("does not touch a model outside the tenant-scoped set", async () => {
    await callWithContext("tenant-a", () =>
      middleware({ model: "User", action: "findMany", args: { where: {} }, dataPath: [], runInTransaction: false }, runNext),
    );
    expect(runNext.mock.calls[0][0].args.where).toEqual({});
  });

  it("is a no-op with no ALS context (background job / worker code paths)", async () => {
    await callWithContext(undefined, () =>
      middleware({ model: "Contact", action: "findMany", args: { where: {} }, dataPath: [], runInTransaction: false }, runNext),
    );
    expect(runNext.mock.calls[0][0].args.where).toEqual({});
  });

  it("injects tenantId into create data when missing", async () => {
    await callWithContext("tenant-a", () =>
      middleware(
        {
          model: "AutomationWorkflow",
          action: "create",
          args: { data: { name: "x" } },
          dataPath: [],
          runInTransaction: false,
        },
        runNext,
      ),
    );
    expect(runNext.mock.calls[0][0].args.data.tenantId).toBe("tenant-a");
  });

  it("injects tenantId into each row of a createMany batch", async () => {
    await callWithContext("tenant-a", () =>
      middleware(
        {
          model: "ContactList",
          action: "createMany",
          args: { data: [{ name: "a" }, { name: "b", tenantId: "already-set" }] },
          dataPath: [],
          runInTransaction: false,
        },
        runNext,
      ),
    );
    const rows = runNext.mock.calls[0][0].args.data;
    expect(rows[0].tenantId).toBe("tenant-a");
    expect(rows[1].tenantId).toBe("already-set"); // explicit value respected
  });

  it("injects tenantId into upsert's where and create, leaves update untouched", async () => {
    await callWithContext("tenant-a", () =>
      middleware(
        {
          model: "Campaign",
          action: "upsert",
          args: { where: {}, create: {}, update: { status: "completed" } },
          dataPath: [],
          runInTransaction: false,
        },
        runNext,
      ),
    );
    const args = runNext.mock.calls[0][0].args;
    expect(args.where.tenantId).toBe("tenant-a");
    expect(args.create.tenantId).toBe("tenant-a");
    expect(args.update).toEqual({ status: "completed" });
  });
});
