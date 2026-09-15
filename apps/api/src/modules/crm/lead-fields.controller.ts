import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { LeadFieldsService } from "./lead-fields.service";
import { CreateLeadFieldDto } from "./dto/create-lead-field.dto";
import { UpdateLeadFieldDto } from "./dto/update-lead-field.dto";
import { ReorderLeadFieldsDto } from "./dto/reorder-lead-fields.dto";
import { JwtAuthGuard } from "../memberships/jwt-auth.guard";
import { RolesGuard } from "../memberships/roles.guard";
import { Roles } from "../memberships/roles.decorator";
import "../../common/request-context";

@Controller("lead-fields")
@UseGuards(JwtAuthGuard, RolesGuard)
export class LeadFieldsController {
  constructor(private readonly leadFieldsService: LeadFieldsService) {}

  /** Readable by anyone who can open the lead entry screen. */
  @Get()
  list(@Req() req: Request) {
    return this.leadFieldsService.list(req.tenantContext!.tenantId);
  }

  /** Changing the shape of the lead form is an admin decision. */
  @Post()
  @Roles("admin")
  create(@Req() req: Request, @Body() dto: CreateLeadFieldDto) {
    return this.leadFieldsService.create(req.tenantContext!.tenantId, dto);
  }

  @Post("reorder")
  @Roles("admin")
  reorder(@Req() req: Request, @Body() dto: ReorderLeadFieldsDto) {
    return this.leadFieldsService.reorder(req.tenantContext!.tenantId, dto.ids);
  }

  @Patch(":id")
  @Roles("admin")
  update(@Req() req: Request, @Param("id") id: string, @Body() dto: UpdateLeadFieldDto) {
    return this.leadFieldsService.update(req.tenantContext!.tenantId, id, dto);
  }

  @Delete(":id")
  @Roles("admin")
  remove(@Req() req: Request, @Param("id") id: string) {
    return this.leadFieldsService.remove(req.tenantContext!.tenantId, id);
  }
}
