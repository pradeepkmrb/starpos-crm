import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import { roleAtLeast, type TenantRole } from "@digitel/shared";
import { ROLES_KEY } from "./roles.decorator";
import "../../common/request-context";

/** Must run after JwtAuthGuard, which guarantees req.tenantContext is set. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<TenantRole | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const role = req.tenantContext?.role;
    if (!role || !roleAtLeast(role, required)) {
      throw new ForbiddenException(`Requires ${required} role or higher`);
    }
    return true;
  }
}
