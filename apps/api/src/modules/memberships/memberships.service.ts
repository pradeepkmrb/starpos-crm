import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes } from "crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { EntitlementsService } from "../entitlements/entitlements.service";
import { RolesService } from "../roles/roles.service";
import { MemberAccessService, roleForScope } from "../roles/member-access.service";
import { CreateInviteDto } from "./dto/create-invite.dto";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const ROLE_SUMMARY = { select: { id: true, name: true } } as const;

@Injectable()
export class MembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly roles: RolesService,
    private readonly memberAccess: MemberAccessService,
  ) {}

  async listMembers(tenantId: string) {
    return this.prisma.tenantMembership.findMany({
      where: { tenantId, status: "active" },
      include: {
        user: { select: { id: true, email: true, name: true } },
        customRole: ROLE_SUMMARY,
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async listPendingInvites(tenantId: string) {
    return this.prisma.tenantInvite.findMany({
      where: { tenantId, acceptedAt: null },
      include: { customRole: ROLE_SUMMARY },
      orderBy: { createdAt: "desc" },
    });
  }

  async createInvite(tenantId: string, invitedByUserId: string, dto: CreateInviteDto) {
    await this.entitlements.assertCanAdd(tenantId, "teamSeats");
    const role = await this.roles.find(tenantId, dto.roleId);

    const token = randomBytes(24).toString("hex");
    const invite = await this.prisma.tenantInvite.create({
      data: {
        tenantId,
        email: dto.email,
        role: roleForScope(role.dataScope === "own" ? "own" : "all"),
        roleId: role.id,
        token,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        invitedByUserId,
      },
      include: { customRole: ROLE_SUMMARY },
    });

    // No email provider wired up yet (Phase 1 scope) — the invite link is
    // returned directly so it can be shared manually until Phase 6 adds
    // transactional email.
    return { ...invite, acceptUrl: `/accept-invite?token=${token}` };
  }

  async revokeInvite(tenantId: string, id: string) {
    const { count } = await this.prisma.tenantInvite.deleteMany({ where: { id, tenantId, acceptedAt: null } });
    if (count === 0) throw new NotFoundException("Invite not found");
    return { id, deleted: true };
  }

  /** Moves a teammate to another role. The owner's access is fixed, and nobody changes their own. */
  async setMemberRole(tenantId: string, actorUserId: string, userId: string, roleId: string) {
    const membership = await this.editableMembership(tenantId, actorUserId, userId, "change your own role");
    const role = await this.roles.find(tenantId, roleId);
    await this.prisma.tenantMembership.update({
      where: { id: membership.id },
      data: { roleId: role.id, role: roleForScope(role.dataScope === "own" ? "own" : "all") },
    });
    this.memberAccess.forget(tenantId, userId);
    return { userId, roleId: role.id };
  }

  /** Takes a teammate out of the workspace. Their leads stay; they just can't sign in to it. */
  async removeMember(tenantId: string, actorUserId: string, userId: string) {
    const membership = await this.editableMembership(tenantId, actorUserId, userId, "remove yourself");
    await this.prisma.tenantMembership.update({ where: { id: membership.id }, data: { status: "removed" } });
    this.memberAccess.forget(tenantId, userId);
    return { userId, removed: true };
  }

  private async editableMembership(tenantId: string, actorUserId: string, userId: string, selfAction: string) {
    const membership = await this.prisma.tenantMembership.findFirst({ where: { tenantId, userId, status: "active" } });
    if (!membership) throw new NotFoundException("Teammate not found");
    if (membership.role === "owner") throw new BadRequestException("The workspace owner always has full access");
    if (userId === actorUserId) throw new BadRequestException(`You can't ${selfAction}`);
    return membership;
  }
}
