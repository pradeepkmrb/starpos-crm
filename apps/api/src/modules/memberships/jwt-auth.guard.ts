import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Request } from "express";
import "../../common/request-context";

/**
 * Gate for the dashboard API: a valid user access token, and nothing else.
 *
 * A workspace API key also produces a tenantContext (see
 * TenantContextMiddleware), but it authenticates a workspace rather than a
 * person and carries no userId — so it is rejected here rather than being
 * let into routes that assume a real user. The public surface it is meant
 * for is /api/v1, behind ApiKeyGuard.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (!req.tenantContext) {
      throw new UnauthorizedException("Missing or invalid access token");
    }
    if (req.tenantContext.apiKeyId) {
      throw new UnauthorizedException(
        "An API key cannot be used here. Sign in for dashboard endpoints, or call the public API under /api/v1.",
      );
    }
    return true;
  }
}
