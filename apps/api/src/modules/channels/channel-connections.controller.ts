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
import "../../common/request-context";
import { Access } from "../roles/access.decorator";

/**
 * The Connections page. WhatsApp keeps its own controller (Embedded Signup and
 * templates are specific to it); everything an operator connects by pasting
 * credentials lives here.
 */
@Controller("connections")
@UseGuards(JwtAuthGuard)
@UseFilters(MetaApiExceptionFilter, EmailChannelExceptionFilter)
@Access("connections")
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
  connectMessenger(@Req() req: Request, @Body() dto: ConnectMessengerDto) {
    return this.connections.connectMessenger(req.tenantContext!.tenantId, dto);
  }

  @Post("instagram")
  connectInstagram(@Req() req: Request, @Body() dto: ConnectInstagramDto) {
    return this.connections.connectInstagram(req.tenantContext!.tenantId, dto);
  }

  @Post("email")
  connectEmail(@Req() req: Request, @Body() dto: ConnectEmailDto) {
    return this.connections.connectEmail(req.tenantContext!.tenantId, dto);
  }

  /** "Sync now" — polls the mailbox immediately instead of waiting for the next scheduled poll. */
  @Post(":id/sync")
  sync(@Req() req: Request, @Param("id") id: string) {
    return this.emailSync.syncChannel(req.tenantContext!.tenantId, id);
  }

  @Post(":id/enable")
  enable(@Req() req: Request, @Param("id") id: string) {
    return this.connections.setEnabled(req.tenantContext!.tenantId, id, true);
  }

  @Post(":id/disable")
  disable(@Req() req: Request, @Param("id") id: string) {
    return this.connections.setEnabled(req.tenantContext!.tenantId, id, false);
  }

  /** Disconnects instead of deleting once the channel has message history. */
  @Delete(":id")
  remove(@Req() req: Request, @Param("id") id: string) {
    return this.connections.remove(req.tenantContext!.tenantId, id);
  }
}
