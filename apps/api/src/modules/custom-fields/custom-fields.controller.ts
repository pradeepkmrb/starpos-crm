import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import type { CustomFieldEntity } from "@digitel/shared";
import { CustomFieldsService } from "./custom-fields.service";
import { CreateCustomFieldDto } from "./dto/create-custom-field.dto";
import { UpdateCustomFieldDto } from "./dto/update-custom-field.dto";
import { ReorderCustomFieldsDto } from "./dto/reorder-custom-fields.dto";
import { JwtAuthGuard } from "../memberships/jwt-auth.guard";
import { RolesGuard } from "../memberships/roles.guard";
import { Roles } from "../memberships/roles.decorator";
import "../../common/request-context";

/**
 * Shared shape for both field builders. Each entity gets its own route so a
 * request can never touch the other entity's fields, and reading is open to
 * anyone who can open the entry screen while editing the form is admin work.
 */
abstract class BaseCustomFieldsController {
  protected abstract readonly entity: CustomFieldEntity;

  constructor(protected readonly customFields: CustomFieldsService) {}

  @Get()
  list(@Req() req: Request) {
    return this.customFields.list(req.tenantContext!.tenantId, this.entity);
  }

  @Post()
  @Roles("admin")
  create(@Req() req: Request, @Body() dto: CreateCustomFieldDto) {
    return this.customFields.create(req.tenantContext!.tenantId, this.entity, dto);
  }

  @Post("reorder")
  @Roles("admin")
  reorder(@Req() req: Request, @Body() dto: ReorderCustomFieldsDto) {
    return this.customFields.reorder(req.tenantContext!.tenantId, this.entity, dto.ids);
  }

  @Patch(":id")
  @Roles("admin")
  update(@Req() req: Request, @Param("id") id: string, @Body() dto: UpdateCustomFieldDto) {
    return this.customFields.update(req.tenantContext!.tenantId, this.entity, id, dto);
  }

  @Delete(":id")
  @Roles("admin")
  remove(@Req() req: Request, @Param("id") id: string) {
    return this.customFields.remove(req.tenantContext!.tenantId, this.entity, id);
  }
}

@Controller("lead-fields")
@UseGuards(JwtAuthGuard, RolesGuard)
export class LeadFieldsController extends BaseCustomFieldsController {
  protected readonly entity = "lead" as const;

  // Declared rather than inherited so TypeScript emits the constructor
  // metadata Nest needs to inject the service.
  constructor(customFields: CustomFieldsService) {
    super(customFields);
  }
}

@Controller("contact-fields")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ContactFieldsController extends BaseCustomFieldsController {
  protected readonly entity = "contact" as const;

  constructor(customFields: CustomFieldsService) {
    super(customFields);
  }
}
