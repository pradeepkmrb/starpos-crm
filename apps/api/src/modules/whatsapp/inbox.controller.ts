import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Req, UseFilters, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { InboxService } from "./inbox.service";
import { LabelsService } from "./labels.service";
import { MetaApiExceptionFilter } from "./meta-api-exception.filter";
import { ReplyMessageDto } from "./dto/reply-message.dto";
import { AssignConversationDto } from "./dto/assign-conversation.dto";
import { SetContactLabelsDto } from "./dto/set-contact-labels.dto";
import { CreateLabelDto } from "./dto/create-label.dto";
import { JwtAuthGuard } from "../memberships/jwt-auth.guard";
import { RolesGuard } from "../memberships/roles.guard";
import { Roles } from "../memberships/roles.decorator";
import "../../common/request-context";

@Controller("inbox")
@UseGuards(JwtAuthGuard, RolesGuard)
@UseFilters(MetaApiExceptionFilter)
export class InboxController {
  constructor(
    private readonly inboxService: InboxService,
    private readonly labelsService: LabelsService,
  ) {}

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

  /** Agents can pick up and hand over conversations themselves. */
  @Patch("conversations/:contactId/assign")
  @Roles("agent")
  assign(@Req() req: Request, @Param("contactId") contactId: string, @Body() dto: AssignConversationDto) {
    return this.inboxService.assign(req.tenantContext!.tenantId, contactId, dto.userId ?? null);
  }

  @Put("conversations/:contactId/labels")
  @Roles("agent")
  setLabels(@Req() req: Request, @Param("contactId") contactId: string, @Body() dto: SetContactLabelsDto) {
    return this.labelsService.setContactLabels(req.tenantContext!.tenantId, contactId, dto.labelIds);
  }

  @Get("labels")
  listLabels(@Req() req: Request) {
    return this.labelsService.list(req.tenantContext!.tenantId);
  }

  @Post("labels")
  @Roles("admin")
  createLabel(@Req() req: Request, @Body() dto: CreateLabelDto) {
    return this.labelsService.create(req.tenantContext!.tenantId, dto.name, dto.color ?? "slate");
  }

  @Delete("labels/:id")
  @Roles("admin")
  removeLabel(@Req() req: Request, @Param("id") id: string) {
    return this.labelsService.remove(req.tenantContext!.tenantId, id);
  }
}
