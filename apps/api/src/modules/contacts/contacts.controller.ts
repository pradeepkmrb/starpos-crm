import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { ContactsService } from "./contacts.service";
import { ImportContactsDto } from "./dto/import-contacts.dto";
import { CreateContactDto } from "./dto/create-contact.dto";
import { BulkDeleteContactsDto } from "./dto/bulk-delete-contacts.dto";
import { JwtAuthGuard } from "../memberships/jwt-auth.guard";
import { RolesGuard } from "../memberships/roles.guard";
import { Roles } from "../memberships/roles.decorator";
import "../../common/request-context";

@Controller("contacts")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get()
  list(@Req() req: Request, @Query("limit") limit?: string) {
    const parsed = Number(limit);
    // Capped so a hand-rolled ?limit= can't pull the whole table in one go.
    const take = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 5000) : 100;
    return this.contactsService.listContacts(req.tenantContext!.tenantId, take);
  }

  @Get("lists")
  listLists(@Req() req: Request) {
    return this.contactsService.listContactLists(req.tenantContext!.tenantId);
  }

  @Get("lists/:id")
  getList(@Req() req: Request, @Param("id") id: string) {
    return this.contactsService.getListWithContacts(req.tenantContext!.tenantId, id);
  }

  @Post("import")
  @Roles("admin")
  import(@Req() req: Request, @Body() dto: ImportContactsDto) {
    return this.contactsService.importCsv(req.tenantContext!.tenantId, dto);
  }

  @Post()
  @Roles("admin")
  create(@Req() req: Request, @Body() dto: CreateContactDto) {
    return this.contactsService.createContact(req.tenantContext!.tenantId, dto);
  }

  /** Erases the contacts along with their message history — see ContactsService. */
  @Post("bulk-delete")
  @Roles("admin")
  bulkDelete(@Req() req: Request, @Body() dto: BulkDeleteContactsDto) {
    return this.contactsService.deleteContacts(req.tenantContext!.tenantId, dto.ids);
  }

  @Delete(":id")
  @Roles("admin")
  remove(@Req() req: Request, @Param("id") id: string) {
    return this.contactsService.deleteContact(req.tenantContext!.tenantId, id);
  }
}
