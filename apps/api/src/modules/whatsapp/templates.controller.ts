import { Body, Controller, Get, Post, Req, UseFilters, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { TemplatesService } from "./templates.service";
import { MetaApiExceptionFilter } from "./meta-api-exception.filter";
import { CreateTemplateDto } from "./dto/create-template.dto";
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
}
