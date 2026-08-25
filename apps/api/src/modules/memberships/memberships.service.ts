import { Injectable } from "@nestjs/common";
import { randomBytes } from "crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { EntitlementsService } from "../entitlements/entitlements.service";
import { CreateInviteDto } from "./dto/create-invite.dto";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class MembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async listMembers(tenantId: string) {
    return this.prisma.tenantMembership.findMany({
      where: { tenantId, status: "active" },
      include: { user: { select: { id: true, email: true, name: true } } },
      orderBy: { createdAt: "asc" },
    });
  }

  async listPendingInvites(tenantId: string) {
    return this.prisma.tenantInvite.findMany({
      where: { tenantId, acceptedAt: null },
      orderBy: { createdAt: "desc" },
    });
  }

  async createInvite(tenantId: string, invitedByUserId: string, dto: CreateInviteDto) {
    await this.entitlements.assertCanAdd(tenantId, "teamSeats");

    const token = randomBytes(24).toString("hex");
    const invite = await this.prisma.tenantInvite.create({
      data: {
        tenantId,
        email: dto.email,
        role: dto.role,
        token,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        invitedByUserId,
      },
    });

    // No email provider wired up yet (Phase 1 scope) — the invite link is
    // returned directly so it can be shared manually until Phase 6 adds
    // transactional email.
    return { ...invite, acceptUrl: `/accept-invite?token=${token}` };
  }
}
