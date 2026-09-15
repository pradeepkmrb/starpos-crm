import { Body, Controller, Delete, Get, Param, Post, Req, UseFilters, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { ChannelConnectionsService } from "./channel-connections.service";
import { EmailSyncService } from "./email-sync.service";
import { ConnectMessengerDto } from "./dto/connect-messenger.dto";
import { ConnectInstagramDto } from "./dto/connect-instagram.dto";
import { ConnectEmailDto } from "./dto/connect-email.dto";
import { EmailChannelExceptionFilter } from "./email-channel-exception.filter";
import { MetaApiExceptionFilter } from "../whatsapp/meta-api-exception.filter";
import { JwtAuthGuard } from "../memberships/jwt-auth.guard";
import { RolesGuard } from "../memberships/roles.guard";
import { Roles } from "../memberships/roles.decorator";
import "../../common/request-context";

/**
 * The Connections page. WhatsApp keeps its own controller (Embedded Signup and
 * templates are specific to it); everything an operator connects by pasting
 * credentials lives here.
 */
@Controller("connections")
@UseGuards(JwtAuthGuard, RolesGuard)
@UseFilters(MetaApiExceptionFilter, EmailChannelExceptionFilter)
export class ChannelConnectionsController {
  constructor(
    private readonly connections: ChannelConnectionsService,
    private readonly emailSync: EmailSyncService,
  ) {}

  @Get()
  list(@Req() req: Request) {
    return this.connections.list(req.tenantContext!.tenantId);
  }

  @Post("facebook")
  @Roles("admin")
  connectMessenger(@Req() req: Request, @Body() dto: ConnectMessengerDto) {
    return this.connections.connectMessenger(req.tenantContext!.tenantId, dto);
  }

  @Post("instagram")
  @Roles("admin")
  connectInstagram(@Req() req: Request, @Body() dto: ConnectInstagramDto) {
    return this.connections.connectInstagram(req.tenantContext!.tenantId, dto);
  }

  @Post("email")
  @Roles("admin")
  connectEmail(@Req() req: Request, @Body() dto: ConnectEmailDto) {
    return this.connections.connectEmail(req.tenantContext!.tenantId, dto);
  }

  /** "Sync now" — polls the mailbox immediately instead of waiting for the next scheduled poll. */
  @Post(":id/sync")
  @Roles("admin")
  sync(@Req() req: Request, @Param("id") id: string) {
    return this.emailSync.syncChannel(req.tenantContext!.tenantId, id);
  }

  @Post(":id/enable")
  @Roles("admin")
  enable(@Req() req: Request, @Param("id") id: string) {
    return this.connections.setEnabled(req.tenantContext!.tenantId, id, true);
  }

  @Post(":id/disable")
  @Roles("admin")
  disable(@Req() req: Request, @Param("id") id: string) {
    return this.connections.setEnabled(req.tenantContext!.tenantId, id, false);
  }

  /** Disconnects instead of deleting once the channel has message history. */
  @Delete(":id")
  @Roles("admin")
  remove(@Req() req: Request, @Param("id") id: string) {
    return this.connections.remove(req.tenantContext!.tenantId, id);
  }
}
