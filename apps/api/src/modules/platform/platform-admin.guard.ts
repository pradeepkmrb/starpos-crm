import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Request } from "express";
import { PrismaService } from "../../prisma/prisma.service";
import "../../common/request-context";

/** Must run after JwtAuthGuard, which guarantees req.tenantContext is set. */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const userId = req.tenantContext!.userId;
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { isPlatformAdmin: true } });
    if (!user?.isPlatformAdmin) {
      throw new ForbiddenException("Platform admin access required");
    }
    return true;
  }
}
