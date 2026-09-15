import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { MetaLeadFormsService } from "./meta-lead-forms.service";
import { LinkMetaFormDto } from "./dto/link-meta-form.dto";
import { UpdateMetaFormDto } from "./dto/update-meta-form.dto";
import { JwtAuthGuard } from "../memberships/jwt-auth.guard";
import { RolesGuard } from "../memberships/roles.guard";
import { Roles } from "../memberships/roles.decorator";
import "../../common/request-context";

/** Wiring a Meta lead-ads form into the CRM is an admin-level integration. */
@Controller("lead-sources/meta")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
export class MetaLeadFormsController {
  constructor(private readonly metaLeadForms: MetaLeadFormsService) {}

  @Get()
  list(@Req() req: Request) {
    return this.metaLeadForms.list(req.tenantContext!.tenantId);
  }

  @Post()
  link(@Req() req: Request, @Body() dto: LinkMetaFormDto) {
    return this.metaLeadForms.link(req.tenantContext!.tenantId, dto);
  }

  @Get(":id/questions")
  questions(@Req() req: Request, @Param("id") id: string) {
    return this.metaLeadForms.questions(req.tenantContext!.tenantId, id);
  }

  /** Pulls recent submissions Meta already holds — the catch-up for leads that predate the webhook. */
  @Post(":id/sync")
  sync(@Req() req: Request, @Param("id") id: string, @Query("limit") limit?: string) {
    const parsed = Number(limit);
    return this.metaLeadForms.sync(
      req.tenantContext!.tenantId,
      id,
      Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 100) : undefined,
    );
  }

  @Patch(":id")
  update(@Req() req: Request, @Param("id") id: string, @Body() dto: UpdateMetaFormDto) {
    return this.metaLeadForms.update(req.tenantContext!.tenantId, id, dto);
  }

  @Delete(":id")
  remove(@Req() req: Request, @Param("id") id: string) {
    return this.metaLeadForms.remove(req.tenantContext!.tenantId, id);
  }
}
