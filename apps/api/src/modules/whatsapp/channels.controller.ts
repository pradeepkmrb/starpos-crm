import { Body, Controller, Get, Param, Post, Req, UseFilters, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { ChannelsService } from "./channels.service";
import { MetaApiExceptionFilter } from "./meta-api-exception.filter";
import { MetaGraphClient } from "./meta-graph.client";
import { MetaOAuthService } from "./meta-oauth.service";
import { CreateChannelDto } from "./dto/create-channel.dto";
import { TestSendDto } from "./dto/test-send.dto";
import { EmbeddedSignupDto } from "./dto/embedded-signup.dto";
import { ContactsService } from "../contacts/contacts.service";
import { MessageLogService } from "../messages/message-log.service";
import { JwtAuthGuard } from "../memberships/jwt-auth.guard";
import { RolesGuard } from "../memberships/roles.guard";
import { Roles } from "../memberships/roles.decorator";
import "../../common/request-context";

@Controller("channels")
@UseGuards(JwtAuthGuard, RolesGuard)
@UseFilters(MetaApiExceptionFilter)
export class ChannelsController {
  constructor(
    private readonly channelsService: ChannelsService,
    private readonly metaGraphClient: MetaGraphClient,
    private readonly metaOAuthService: MetaOAuthService,
    private readonly contactsService: ContactsService,
    private readonly messageLogService: MessageLogService,
  ) {}

  @Get()
  list(@Req() req: Request) {
    return this.channelsService.listChannels(req.tenantContext!.tenantId);
  }

  @Post()
  @Roles("admin")
  create(@Req() req: Request, @Body() dto: CreateChannelDto) {
    return this.channelsService.createChannel(req.tenantContext!.tenantId, dto);
  }

  @Post("embedded-signup")
  @Roles("admin")
  async embeddedSignup(@Req() req: Request, @Body() dto: EmbeddedSignupDto) {
    const tenantId = req.tenantContext!.tenantId;

    const shortLivedToken = await this.metaOAuthService.exchangeCodeForToken(dto.code);
    const accessToken = await this.metaOAuthService.getLongLivedToken(shortLivedToken);
    const { displayPhoneNumber } = await this.metaOAuthService.getPhoneNumberDetails(dto.phoneNumberId, accessToken);
    await this.metaOAuthService.subscribeAppToWaba(dto.wabaId, accessToken);

    return this.channelsService.createChannelFromEmbeddedSignup(tenantId, {
      wabaId: dto.wabaId,
      phoneNumberId: dto.phoneNumberId,
      accessToken,
      displayPhoneNumber,
    });
  }

  @Post(":id/disconnect")
  @Roles("admin")
  disconnect(@Req() req: Request, @Param("id") id: string) {
    return this.channelsService.disconnectChannel(req.tenantContext!.tenantId, id);
  }

  @Get(":id/templates")
  @Roles("admin")
  async listTemplates(@Req() req: Request, @Param("id") id: string) {
    const channel = await this.channelsService.getChannelWithCredentials(req.tenantContext!.tenantId, id);
    return this.metaGraphClient.listTemplates(channel);
  }

  @Get(":id/messages")
  listMessages(@Req() req: Request, @Param("id") id: string) {
    return this.messageLogService.listForChannel(req.tenantContext!.tenantId, id);
  }

  @Post(":id/test-send")
  @Roles("admin")
  async testSend(@Req() req: Request, @Param("id") id: string, @Body() dto: TestSendDto) {
    const tenantId = req.tenantContext!.tenantId;
    const channel = await this.channelsService.getChannelWithCredentials(tenantId, id);
    const { contact } = await this.contactsService.upsertByNumber(tenantId, dto.to);

    const { waMessageId } = await this.metaGraphClient.sendTemplateMessage(
      channel,
      dto.to,
      dto.templateName,
      dto.languageCode ?? "en_US",
    );

    return this.messageLogService.recordOutbound({
      tenantId,
      channelId: channel.id,
      contactId: contact.id,
      waMessageId,
      payload: { templateName: dto.templateName, languageCode: dto.languageCode ?? "en_US" },
    });
  }
}
