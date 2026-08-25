import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { MembershipsService } from "./memberships.service";
import { CreateInviteDto } from "./dto/create-invite.dto";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { RolesGuard } from "./roles.guard";
import { Roles } from "./roles.decorator";
import "../../common/request-context";

@Controller("tenants")
@UseGuards(JwtAuthGuard, RolesGuard)
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  @Get("members")
  listMembers(@Req() req: Request) {
    return this.membershipsService.listMembers(req.tenantContext!.tenantId);
  }

  @Get("invites")
  @Roles("admin")
  listInvites(@Req() req: Request) {
    return this.membershipsService.listPendingInvites(req.tenantContext!.tenantId);
  }

  @Post("invites")
  @Roles("admin")
  createInvite(@Req() req: Request, @Body() dto: CreateInviteDto) {
    const { tenantId, userId } = req.tenantContext!;
    return this.membershipsService.createInvite(tenantId, userId, dto);
  }
}
