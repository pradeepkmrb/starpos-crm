import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Request } from "express";
import "../../common/request-context";

/**
 * Gate for the public /api/v1 surface. TenantContextMiddleware has already
 * resolved the X-API-Key header if one was sent; this only insists that it
 * resolved to something. A dashboard session token is deliberately not
 * accepted here — the two audiences stay separate.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (!req.tenantContext?.apiKeyId) {
      throw new UnauthorizedException(
        "Missing or invalid API key. Send it as the X-API-Key header on every request.",
      );
    }
    return true;
  }
}
