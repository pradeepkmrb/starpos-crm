import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { FULL_ACCESS, normalizePermissions, type Permissions } from "@starpos-crm/shared";
import { AccessGuard } from "./access.guard";
import { ACCESS_KEY, Access, AnyMember } from "./access.decorator";
import type { TenantRequestContext } from "../../common/request-context";

class LeadsLike {
  @Access({ view: ["leads", "quotations"], edit: ["leads"] })
  handler() {}

  @Access("billing", "edit")
  editOnly() {}

  @AnyMember()
  anyone() {}

  undecorated() {}
}

function run(method: string, handler: keyof LeadsLike, ctx?: Partial<TenantRequestContext>) {
  const guard = new AccessGuard(new Reflector());
  const context = {
    getHandler: () => LeadsLike.prototype[handler],
    getClass: () => LeadsLike,
    switchToHttp: () => ({
      getRequest: () => ({
        method,
        tenantContext: ctx && { userId: "u1", tenantId: "t1", role: "agent", dataScope: "own", ...ctx },
      }),
    }),
  } as unknown as ExecutionContext;
  return () => guard.canActivate(context);
}

const perms = (p: Partial<Permissions>) => normalizePermissions(p);

describe("AccessGuard", () => {
  it("lets a GET through with View on any listed menu", () => {
    expect(run("GET", "handler", { permissions: perms({ quotations: "view" }) })()).toBe(true);
  });

  it("refuses a GET without View on any listed menu", () => {
    expect(run("GET", "handler", { permissions: perms({ payments: "edit" }) })).toThrow(ForbiddenException);
  });

  it("needs Edit on the edit list for changes", () => {
    expect(run("POST", "handler", { permissions: perms({ leads: "edit" }) })()).toBe(true);
    // Edit on quotations only grants reading here.
    expect(run("PATCH", "handler", { permissions: perms({ leads: "view", quotations: "edit" }) })).toThrow(
      "can't make changes in Leads",
    );
  });

  it("honours a fixed level even for a GET", () => {
    expect(run("GET", "editOnly", { permissions: perms({ billing: "view" }) })).toThrow(ForbiddenException);
  });

  it("always lets the owner through", () => {
    expect(run("DELETE", "handler", { role: "owner", permissions: perms({}) })()).toBe(true);
  });

  it("ignores routes without a rule, or marked for any member", () => {
    expect(run("POST", "undecorated", { permissions: perms({}) })()).toBe(true);
    expect(run("POST", "anyone", { permissions: perms({}) })()).toBe(true);
  });

  it("leaves unauthenticated requests to JwtAuthGuard", () => {
    expect(run("GET", "handler")()).toBe(true);
  });

  it("stores the rule under the shared metadata key", () => {
    expect(Reflect.getMetadata(ACCESS_KEY, LeadsLike.prototype.handler)).toEqual({
      view: ["leads", "quotations"],
      edit: ["leads"],
      level: undefined,
    });
    expect(FULL_ACCESS.leads).toBe("edit");
  });
});
