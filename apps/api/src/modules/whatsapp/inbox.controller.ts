import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Req, UseFilters, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { InboxService } from "./inbox.service";
import { LabelsService } from "./labels.service";
import { MetaApiExceptionFilter } from "./meta-api-exception.filter";
import { ReplyMessageDto } from "./dto/reply-message.dto";
import { SendTemplateDto } from "./dto/send-template.dto";
import { AssignConversationDto } from "./dto/assign-conversation.dto";
import { SetContactLabelsDto } from "./dto/set-contact-labels.dto";
import { CreateLabelDto } from "./dto/create-label.dto";
import { JwtAuthGuard } from "../memberships/jwt-auth.guard";
import "../../common/request-context";
import { Access } from "../roles/access.decorator";

@Controller("inbox")
@UseGuards(JwtAuthGuard)
@UseFilters(MetaApiExceptionFilter)
@Access("inbox")
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
  reply(@Req() req: Request, @Param("contactId") contactId: string, @Body() dto: ReplyMessageDto) {
    return this.inboxService.reply(req.tenantContext!.tenantId, contactId, dto.body);
  }

  /**
   * Starts or re-opens a conversation with an approved template — the only
   * way to message a contact outside the 24-hour window, including one who
   * has no message history yet.
   */
  @Post("conversations/:contactId/send-template")
  sendTemplate(@Req() req: Request, @Param("contactId") contactId: string, @Body() dto: SendTemplateDto) {
    return this.inboxService.sendTemplate(req.tenantContext!.tenantId, contactId, dto.templateId, dto.channelId);
  }

  /** Agents can pick up and hand over conversations themselves. */
  @Patch("conversations/:contactId/assign")
  assign(@Req() req: Request, @Param("contactId") contactId: string, @Body() dto: AssignConversationDto) {
    return this.inboxService.assign(req.tenantContext!.tenantId, contactId, dto.userId ?? null);
  }

  @Put("conversations/:contactId/labels")
  setLabels(@Req() req: Request, @Param("contactId") contactId: string, @Body() dto: SetContactLabelsDto) {
    return this.labelsService.setContactLabels(req.tenantContext!.tenantId, contactId, dto.labelIds);
  }

  @Get("labels")
  listLabels(@Req() req: Request) {
    return this.labelsService.list(req.tenantContext!.tenantId);
  }

  @Post("labels")
  createLabel(@Req() req: Request, @Body() dto: CreateLabelDto) {
    return this.labelsService.create(req.tenantContext!.tenantId, dto.name, dto.color ?? "slate");
  }

  @Delete("labels/:id")
  removeLabel(@Req() req: Request, @Param("id") id: string) {
    return this.labelsService.remove(req.tenantContext!.tenantId, id);
  }
}
