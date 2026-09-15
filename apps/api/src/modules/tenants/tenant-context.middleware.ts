import { Injectable, NestMiddleware } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { NextFunction, Request, Response } from "express";
import { tenantContextStore } from "../../prisma/tenant-context.store";
import { ApiKeysService } from "../api-keys/api-keys.service";
import "../../common/request-context";

export const API_KEY_HEADER = "x-api-key";

/**
 * Resolves the caller's tenant context on every request, from either of the
 * two credentials the platform accepts: a user's Bearer access token (the
 * dashboard) or a workspace API key (the public /api/v1 surface).
 *
 * Does not reject unauthenticated requests itself — some routes, like
 * /auth/login and Meta's webhook callback, must stay public. JwtAuthGuard
 * and ApiKeyGuard are what enforce that a context is present, and which of
 * the two kinds a given route will accept.
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(
    private readonly jwtService: JwtService,
    private readonly apiKeysService: ApiKeysService,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice("Bearer ".length);
      try {
        const payload = this.jwtService.verify(token, {
          secret: process.env.JWT_ACCESS_SECRET,
        });
        req.tenantContext = {
          userId: payload.userId,
          tenantId: payload.tenantId,
          role: payload.role,
        };
      } catch {
        // invalid/expired token: leave tenantContext undefined
      }
    }

    // Only consulted when no valid session token was presented, so a logged-in
    // dashboard request can never be silently re-attributed to another
    // workspace by a stray header.
    if (!req.tenantContext) {
      const rawKey = readApiKeyHeader(req);
      if (rawKey) {
        const principal = await this.apiKeysService.authenticate(rawKey);
        if (principal) {
          req.tenantContext = {
            userId: "",
            tenantId: principal.tenantId,
            // A key acts for the whole workspace, short of owner-only actions
            // such as billing and rotating the key itself.
            role: "admin",
            apiKeyId: principal.apiKeyId,
          };
        }
      }
    }

    if (req.tenantContext) {
      tenantContextStore.run({ tenantId: req.tenantContext.tenantId }, next);
    } else {
      next();
    }
  }
}

/**
 * Accepts the documented `X-API-Key` header, and `Authorization: Bearer` is
 * deliberately not an alias — it is already taken by session tokens.
 */
function readApiKeyHeader(req: Request): string | null {
  const raw = req.headers[API_KEY_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value?.trim() ? value.trim() : null;
}
