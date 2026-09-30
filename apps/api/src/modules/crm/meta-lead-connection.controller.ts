import { Body, Controller, Delete, Get, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { MetaLeadConnectionService } from "./meta-lead-connection.service";
import { ConnectMetaLeadsDto, UpdateMetaLeadConnectionDto } from "./dto/meta-lead-connection.dto";
import { JwtAuthGuard } from "../memberships/jwt-auth.guard";
import "../../common/request-context";
import { Access } from "../roles/access.decorator";

/** "Connect with Meta" for lead ads — admin-level, like every integration. */
@Controller("lead-sources/meta-connection")
@UseGuards(JwtAuthGuard)
@Access("integrations")
export class MetaLeadConnectionController {
  constructor(private readonly connections: MetaLeadConnectionService) {}

  @Get()
  get(@Req() req: Request) {
    return this.connections.get(req.tenantContext!.tenantId);
  }

  @Post()
  connect(@Req() req: Request, @Body() dto: ConnectMetaLeadsDto) {
    const { tenantId, userId } = req.tenantContext!;
    return this.connections.connect(tenantId, userId, dto);
  }

  @Post("refresh")
  refresh(@Req() req: Request) {
    return this.connections.refresh(req.tenantContext!.tenantId);
  }

  @Patch()
  update(@Req() req: Request, @Body() dto: UpdateMetaLeadConnectionDto) {
    return this.connections.update(req.tenantContext!.tenantId, dto);
  }

  @Delete()
  disconnect(@Req() req: Request) {
    return this.connections.disconnect(req.tenantContext!.tenantId);
  }
}
