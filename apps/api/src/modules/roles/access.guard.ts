import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import { ACCESS_MODULES, hasAccess } from "@starpos-crm/shared";
import { ACCESS_KEY, type AccessRule } from "./access.decorator";
import "../../common/request-context";

const LABELS = new Map<string, string>(ACCESS_MODULES.map((m) => [m.key, m.label]));

/**
 * Enforces @Access on every route (registered globally). Routes without it
 * are left alone — public pages and webhooks have no caller, and JwtAuthGuard
 * still decides whether a route needs one at all.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const rule = this.reflector.getAllAndOverride<AccessRule | "any" | undefined>(ACCESS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!rule || rule === "any") return true;

    const req = context.switchToHttp().getRequest<Request>();
    const ctx = req.tenantContext;
    // No caller: JwtAuthGuard (which runs after this one) turns it away.
    if (!ctx) return true;
    if (ctx.role === "owner") return true;

    const level = rule.level ?? (req.method === "GET" || req.method === "HEAD" ? "view" : "edit");
    const modules = level === "view" ? rule.view : rule.edit;
    if (hasAccess(ctx.permissions, modules, level)) return true;

    const names = modules.map((m) => LABELS.get(m) ?? m).join(" or ");
    throw new ForbiddenException(
      level === "view" ? `Your role doesn't have access to ${names}` : `Your role can't make changes in ${names}`,
    );
  }
}
