import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseFilters, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { PublicMessagesService } from "./public-messages.service";
import { PublicContactsService } from "./public-contacts.service";
import { PublicWorkspaceService } from "./public-workspace.service";
import { ApiKeyGuard } from "./api-key.guard";
import { ApiRateLimitGuard } from "./api-rate-limit.guard";
import { PublicApiExceptionFilter } from "./public-api-exception.filter";
import { SendTextDto } from "./dto/send-text.dto";
import { SendTemplateDto } from "./dto/send-template.dto";
import { SendMediaDto } from "./dto/send-media.dto";
import { SendInteractiveDto } from "./dto/send-interactive.dto";
import { UpdateContactApiDto, UpsertContactDto } from "./dto/upsert-contact.dto";
import "../../common/request-context";

/**
 * The tenant-facing REST API, versioned in the path so a future v2 can live
 * alongside it. Authenticated by the X-API-Key header alone (see
 * ApiKeyGuard) and documented on the dashboard's API & Developers page,
 * which is generated from this same list of routes.
 */
@Controller("api/v1")
@UseGuards(ApiKeyGuard, ApiRateLimitGuard)
@UseFilters(PublicApiExceptionFilter)
export class PublicApiController {
  constructor(
    private readonly messages: PublicMessagesService,
    private readonly contacts: PublicContactsService,
    private readonly workspace: PublicWorkspaceService,
  ) {}

  // --- Authentication ---

  /** Verifies a key and describes the workspace behind it. */
  @Get("me")
  me(@Req() req: Request) {
    const ctx = req.tenantContext!;
    return this.workspace.me(ctx.tenantId, ctx.apiKeyId!);
  }

  // --- Messages ---

  /** Free-form text. Needs the contact's 24-hour window to be open. */
  @Post("messages/send")
  sendText(@Req() req: Request, @Body() dto: SendTextDto) {
    return this.messages.sendText(req.tenantContext!.tenantId, dto);
  }

  /** Approved template. The only send that works outside the 24-hour window. */
  @Post("messages/send-template")
  sendTemplate(@Req() req: Request, @Body() dto: SendTemplateDto) {
    return this.messages.sendTemplate(req.tenantContext!.tenantId, dto);
  }

  /** Image, video, document, audio or sticker. Needs an open 24-hour window. */
  @Post("messages/send-media")
  sendMedia(@Req() req: Request, @Body() dto: SendMediaDto) {
    return this.messages.sendMedia(req.tenantContext!.tenantId, dto);
  }

  /** Reply buttons or a list picker. Needs an open 24-hour window. */
  @Post("messages/send-interactive")
  sendInteractive(@Req() req: Request, @Body() dto: SendInteractiveDto) {
    return this.messages.sendInteractive(req.tenantContext!.tenantId, dto);
  }

  /** Delivery state. Accepts our message id or Meta's wamid. */
  @Get("messages/:id")
  getMessage(@Req() req: Request, @Param("id") id: string) {
    return this.messages.getMessage(req.tenantContext!.tenantId, id);
  }

  // --- Contacts ---

  @Get("contacts")
  listContacts(
    @Req() req: Request,
    @Query() query: { limit?: string; cursor?: string; search?: string; listId?: string; optedIn?: string },
  ) {
    return this.contacts.list(req.tenantContext!.tenantId, query);
  }

  /** Declared before :id so the literal segment is not swallowed by the param. */
  @Get("contacts/by-number/:number")
  getContactByNumber(@Req() req: Request, @Param("number") number: string) {
    return this.contacts.getByNumber(req.tenantContext!.tenantId, number);
  }

  @Get("contacts/:id")
  getContact(@Req() req: Request, @Param("id") id: string) {
    return this.contacts.get(req.tenantContext!.tenantId, id);
  }

  /** Create or update by phone number, so repeated syncs converge. */
  @Post("contacts")
  upsertContact(@Req() req: Request, @Body() dto: UpsertContactDto) {
    return this.contacts.upsert(req.tenantContext!.tenantId, dto);
  }

  @Patch("contacts/:id")
  updateContact(@Req() req: Request, @Param("id") id: string, @Body() dto: UpdateContactApiDto) {
    return this.contacts.update(req.tenantContext!.tenantId, id, dto);
  }

  @Get("lists")
  listLists(@Req() req: Request) {
    return this.contacts.listLists(req.tenantContext!.tenantId);
  }

  // --- Templates & channels ---

  /** Approved templates by default; pass ?status=all while chasing an approval. */
  @Get("templates")
  listTemplates(@Req() req: Request, @Query("status") status?: string) {
    return this.workspace.listTemplates(req.tenantContext!.tenantId, status);
  }

  @Get("channels")
  listChannels(@Req() req: Request) {
    return this.workspace.listChannels(req.tenantContext!.tenantId);
  }
}
