import { Body, Controller, Get, Param, Post, Req, UseFilters, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { InboxService } from "./inbox.service";
import { MetaApiExceptionFilter } from "./meta-api-exception.filter";
import { ReplyMessageDto } from "./dto/reply-message.dto";
import { JwtAuthGuard } from "../memberships/jwt-auth.guard";
import { RolesGuard } from "../memberships/roles.guard";
import { Roles } from "../memberships/roles.decorator";
import "../../common/request-context";

@Controller("inbox")
@UseGuards(JwtAuthGuard, RolesGuard)
@UseFilters(MetaApiExceptionFilter)
export class InboxController {
  constructor(private readonly inboxService: InboxService) {}

  @Get("conversations")
  listConversations(@Req() req: Request) {
    return this.inboxService.listConversations(req.tenantContext!.tenantId);
  }

  @Get("conversations/:contactId")
  getConversation(@Req() req: Request, @Param("contactId") contactId: string) {
    return this.inboxService.getConversation(req.tenantContext!.tenantId, contactId);
  }

  /** Free-form reply — only valid inside Meta's 24-hour customer-service window. */
  @Post("conversations/:contactId/reply")
  @Roles("agent")
  reply(@Req() req: Request, @Param("contactId") contactId: string, @Body() dto: ReplyMessageDto) {
    return this.inboxService.reply(req.tenantContext!.tenantId, contactId, dto.body);
  }
}
