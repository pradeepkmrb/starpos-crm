import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { MembershipsService } from "./memberships.service";
import { CreateInviteDto, SetMemberRoleDto } from "./dto/create-invite.dto";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { Access } from "../roles/access.decorator";
import "../../common/request-context";

@Controller("tenants")
@UseGuards(JwtAuthGuard)
@Access("team")
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  /**
   * The teammate list also fills the "assigned to" pickers across sales and
   * the inbox, so anyone working those menus can read it.
   */
  @Get("members")
  @Access({ view: ["team", "inbox", "leads", "follow_ups", "visits", "quotations", "payments", "targets", "analytics"] })
  listMembers(@Req() req: Request) {
    return this.membershipsService.listMembers(req.tenantContext!.tenantId);
  }

  @Patch("members/:userId")
  setMemberRole(@Req() req: Request, @Param("userId") userId: string, @Body() dto: SetMemberRoleDto) {
    const { tenantId, userId: actorUserId } = req.tenantContext!;
    return this.membershipsService.setMemberRole(tenantId, actorUserId, userId, dto.roleId);
  }

  @Delete("members/:userId")
  removeMember(@Req() req: Request, @Param("userId") userId: string) {
    const { tenantId, userId: actorUserId } = req.tenantContext!;
    return this.membershipsService.removeMember(tenantId, actorUserId, userId);
  }

  @Get("invites")
  listInvites(@Req() req: Request) {
    return this.membershipsService.listPendingInvites(req.tenantContext!.tenantId);
  }

  @Post("invites")
  createInvite(@Req() req: Request, @Body() dto: CreateInviteDto) {
    const { tenantId, userId } = req.tenantContext!;
    return this.membershipsService.createInvite(tenantId, userId, dto);
  }

  @Delete("invites/:id")
  revokeInvite(@Req() req: Request, @Param("id") id: string) {
    return this.membershipsService.revokeInvite(req.tenantContext!.tenantId, id);
  }
}
