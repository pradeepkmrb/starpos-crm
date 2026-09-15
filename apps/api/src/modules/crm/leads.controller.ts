import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { LeadsService } from "./leads.service";
import { CreateLeadDto } from "./dto/create-lead.dto";
import { UpdateLeadDto } from "./dto/update-lead.dto";
import { JwtAuthGuard } from "../memberships/jwt-auth.guard";
import { RolesGuard } from "../memberships/roles.guard";
import { Roles } from "../memberships/roles.decorator";
import "../../common/request-context";

@Controller("leads")
@UseGuards(JwtAuthGuard, RolesGuard)
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Get()
  list(
    @Req() req: Request,
    @Query("status") status?: string,
    @Query("q") search?: string,
    @Query("limit") limit?: string,
  ) {
    const parsed = Number(limit);
    // Capped so a hand-rolled ?limit= can't pull the whole table in one go.
    const take = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 2000) : 200;
    return this.leadsService.list(req.tenantContext!.tenantId, { status, search, take });
  }

  /** Declared before :id so "summary" isn't read as a lead id. */
  @Get("summary")
  summary(@Req() req: Request) {
    return this.leadsService.summary(req.tenantContext!.tenantId);
  }

  @Get(":id")
  get(@Req() req: Request, @Param("id") id: string) {
    return this.leadsService.get(req.tenantContext!.tenantId, id);
  }

  /** Agent-level: capturing and working leads is the day job, not an admin task. */
  @Post()
  @Roles("agent")
  create(@Req() req: Request, @Body() dto: CreateLeadDto) {
    return this.leadsService.create(req.tenantContext!.tenantId, dto);
  }

  @Patch(":id")
  @Roles("agent")
  update(@Req() req: Request, @Param("id") id: string, @Body() dto: UpdateLeadDto) {
    return this.leadsService.update(req.tenantContext!.tenantId, id, dto);
  }

  @Delete(":id")
  @Roles("admin")
  remove(@Req() req: Request, @Param("id") id: string) {
    return this.leadsService.remove(req.tenantContext!.tenantId, id);
  }
}
