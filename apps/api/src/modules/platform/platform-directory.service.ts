import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuthService } from "../auth/auth.service";
import { CreateTenantDto } from "./dto/create-tenant.dto";

const SAFE_CHANNEL_SELECT = {
  id: true,
  wabaId: true,
  phoneNumberId: true,
  displayPhoneNumber: true,
  status: true,
  messagingTier: true,
  createdAt: true,
} as const;

/** Cross-tenant "directory" reads for the platform-admin backoffice — tenants, their subscriptions, and their channels. */
@Injectable()
export class PlatformDirectoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  listTenants() {
    return this.prisma.tenant.findMany({
      include: {
        plan: true,
        subscription: true,
        memberships: {
          where: { role: "owner" },
          take: 1,
          include: { user: { select: { email: true, name: true } } },
        },
        _count: { select: { memberships: true, channels: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  createTenant(dto: CreateTenantDto) {
    return this.authService.adminCreateTenant(dto);
  }

  listChannels() {
    // WhatsappChannel is a tenant-scoped model — the scoping middleware
    // (tenant-scoping.middleware.ts) would otherwise silently inject the
    // *calling admin's own* tenantId into an unscoped `where`, defeating the
    // entire point of a cross-tenant directory view. Passing a `where` that
    // already names `tenantId` (matching every non-empty id, i.e. every row)
    // uses the middleware's own explicit-already-present bypass instead.
    return this.prisma.whatsappChannel.findMany({
      where: { tenantId: { not: "" } },
      select: { ...SAFE_CHANNEL_SELECT, tenant: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
  }
}
