import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import type { CustomFieldEntity } from "@starpos-crm/shared";
import { CustomFieldsService } from "./custom-fields.service";
import { CreateCustomFieldDto } from "./dto/create-custom-field.dto";
import { UpdateCustomFieldDto } from "./dto/update-custom-field.dto";
import { ReorderCustomFieldsDto } from "./dto/reorder-custom-fields.dto";
import { JwtAuthGuard } from "../memberships/jwt-auth.guard";
import "../../common/request-context";
import { Access } from "../roles/access.decorator";

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
  create(@Req() req: Request, @Body() dto: CreateCustomFieldDto) {
    return this.customFields.create(req.tenantContext!.tenantId, this.entity, dto);
  }

  @Post("reorder")
  reorder(@Req() req: Request, @Body() dto: ReorderCustomFieldsDto) {
    return this.customFields.reorder(req.tenantContext!.tenantId, this.entity, dto.ids);
  }

  @Patch(":id")
  update(@Req() req: Request, @Param("id") id: string, @Body() dto: UpdateCustomFieldDto) {
    return this.customFields.update(req.tenantContext!.tenantId, this.entity, id, dto);
  }

  @Delete(":id")
  remove(@Req() req: Request, @Param("id") id: string) {
    return this.customFields.remove(req.tenantContext!.tenantId, this.entity, id);
  }
}

@Controller("lead-fields")
@UseGuards(JwtAuthGuard)
@Access({ view: ["leads", "follow_ups", "visits", "quotations", "lead_fields"], edit: ["lead_fields"] })
export class LeadFieldsController extends BaseCustomFieldsController {
  protected readonly entity = "lead" as const;

  // Declared rather than inherited so TypeScript emits the constructor
  // metadata Nest needs to inject the service.
  constructor(customFields: CustomFieldsService) {
    super(customFields);
  }
}

@Controller("contact-fields")
@UseGuards(JwtAuthGuard)
@Access({ view: ["audience", "inbox", "broadcasts", "contact_fields"], edit: ["contact_fields"] })
export class ContactFieldsController extends BaseCustomFieldsController {
  protected readonly entity = "contact" as const;

  constructor(customFields: CustomFieldsService) {
    super(customFields);
  }
}
