import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { ContactsService } from "./contacts.service";
import { ImportContactsDto } from "./dto/import-contacts.dto";
import { JwtAuthGuard } from "../memberships/jwt-auth.guard";
import { RolesGuard } from "../memberships/roles.guard";
import { Roles } from "../memberships/roles.decorator";
import "../../common/request-context";

@Controller("contacts")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get()
  list(@Req() req: Request) {
    return this.contactsService.listContacts(req.tenantContext!.tenantId);
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
}
