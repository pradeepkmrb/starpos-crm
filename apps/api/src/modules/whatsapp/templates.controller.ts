import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseFilters, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { TemplatesService } from "./templates.service";
import { MetaApiExceptionFilter } from "./meta-api-exception.filter";
import { CreateTemplateDto } from "./dto/create-template.dto";
import { UpdateTemplateDto } from "./dto/update-template.dto";
import { JwtAuthGuard } from "../memberships/jwt-auth.guard";
import { RolesGuard } from "../memberships/roles.guard";
import { Roles } from "../memberships/roles.decorator";
import "../../common/request-context";

@Controller("templates")
@UseGuards(JwtAuthGuard, RolesGuard)
@UseFilters(MetaApiExceptionFilter)
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Get()
  list(@Req() req: Request) {
    return this.templatesService.listForTenant(req.tenantContext!.tenantId);
  }

  @Post()
  @Roles("admin")
  create(@Req() req: Request, @Body() dto: CreateTemplateDto) {
    return this.templatesService.createAndSubmit(req.tenantContext!.tenantId, dto);
  }

  /** Imports templates that already exist on the tenant's connected WABAs. */
  @Post("sync")
  @Roles("admin")
  async sync(@Req() req: Request) {
    const tenantId = req.tenantContext!.tenantId;
    const result = await this.templatesService.syncFromMeta(tenantId);
    return { ...result, templates: await this.templatesService.listForTenant(tenantId) };
  }

  @Patch(":id")
  @Roles("admin")
  update(@Req() req: Request, @Param("id") id: string, @Body() dto: UpdateTemplateDto) {
    return this.templatesService.update(req.tenantContext!.tenantId, id, dto);
  }

  @Delete(":id")
  @Roles("admin")
  remove(@Req() req: Request, @Param("id") id: string) {
    return this.templatesService.remove(req.tenantContext!.tenantId, id);
  }
}
