import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { FULL_ACCESS } from "@starpos-crm/shared";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { ApiKeyGuard } from "../public-api/api-key.guard";
import type { TenantRequestContext } from "../../common/request-context";

function contextFor(tenantContext?: TenantRequestContext): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ tenantContext }) }),
  } as unknown as ExecutionContext;
}

const userContext: TenantRequestContext = {
  userId: "user_1",
  tenantId: "tenant_1",
  role: "admin",
  permissions: FULL_ACCESS,
  dataScope: "all",
};
const apiKeyContext: TenantRequestContext = {
  userId: "",
  tenantId: "tenant_1",
  role: "admin",
  permissions: FULL_ACCESS,
  dataScope: "all",
  apiKeyId: "key_1",
};

describe("JwtAuthGuard", () => {
  const guard = new JwtAuthGuard();

  it("admits a request carrying a user session", () => {
    expect(guard.canActivate(contextFor(userContext))).toBe(true);
  });

  it("rejects an unauthenticated request", () => {
    expect(() => guard.canActivate(contextFor(undefined))).toThrow(UnauthorizedException);
  });

  /**
   * An API key authenticates a workspace, not a person, so it must not open
   * the dashboard routes — several of which read tenantContext.userId.
   */
  it("rejects an API key, which belongs on /api/v1 instead", () => {
    expect(() => guard.canActivate(contextFor(apiKeyContext))).toThrow(UnauthorizedException);
  });
});

describe("ApiKeyGuard", () => {
  const guard = new ApiKeyGuard();

  it("admits a request authenticated by an API key", () => {
    expect(guard.canActivate(contextFor(apiKeyContext))).toBe(true);
  });

  it("rejects an unauthenticated request", () => {
    expect(() => guard.canActivate(contextFor(undefined))).toThrow(UnauthorizedException);
  });

  /** The mirror of the rule above: a dashboard session is not an API credential. */
  it("rejects a dashboard session token", () => {
    expect(() => guard.canActivate(contextFor(userContext))).toThrow(UnauthorizedException);
  });
});
