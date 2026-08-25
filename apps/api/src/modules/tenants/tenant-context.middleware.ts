import { Injectable, NestMiddleware } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { NextFunction, Request, Response } from "express";
import { tenantContextStore } from "../../prisma/tenant-context.store";
import "../../common/request-context";

/**
 * Resolves the caller's tenant context from the Authorization header on
 * every request. Does not reject unauthenticated requests itself (some
 * routes, like /auth/login, must stay public) — JwtAuthGuard is what
 * enforces that req.tenantContext is present on protected routes.
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(private readonly jwtService: JwtService) {}

  use(req: Request, _res: Response, next: NextFunction) {
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

    if (req.tenantContext) {
      tenantContextStore.run({ tenantId: req.tenantContext.tenantId }, next);
    } else {
      next();
    }
  }
}
