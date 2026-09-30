import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { LeadsService } from "./leads.service";
import { CreateLeadDto } from "./dto/create-lead.dto";
import { UpdateLeadDto } from "./dto/update-lead.dto";
import { JwtAuthGuard } from "../memberships/jwt-auth.guard";
import "../../common/request-context";
import { visibleLeadsWhere } from "../../common/lead-visibility";
import { Access } from "../roles/access.decorator";

@Controller("leads")
@UseGuards(JwtAuthGuard)
@Access({ view: ["leads", "follow_ups", "visits", "quotations", "payments", "targets"], edit: ["leads"] })
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Get()
  list(
    @Req() req: Request,
    @Query("status") status?: string,
    @Query("q") search?: string,
    @Query("limit") limit?: string,
    @Query("owner") owner?: string,
    @Query("hot") hot?: string,
  ) {
    const parsed = Number(limit);
    // Capped so a hand-rolled ?limit= can't pull the whole table in one go.
    const take = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 2000) : 200;
    const ctx = req.tenantContext!;
    // "me" for an API-key caller (no user) matches nobody rather than everybody.
    const ownerUserId =
      owner === "me" ? ctx.userId || "__nobody__" : owner === "unassigned" ? null : owner || undefined;
    return this.leadsService.list(ctx.tenantId, {
      status,
      search,
      take,
      ownerUserId,
      hot: hot === "true",
      visibility: visibleLeadsWhere(ctx),
    });
  }

  /**
   * Leads near a point, closest first — the app's "Nearby" list and map.
   * Declared before :id, like summary. Radius defaults to 5 km, capped at 50.
   */
  @Get("nearby")
  nearby(
    @Req() req: Request,
    @Query("lat") lat?: string,
    @Query("lng") lng?: string,
    @Query("radiusKm") radiusKm?: string,
    @Query("owner") owner?: string,
  ) {
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (!lat || !lng || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      throw new BadRequestException("lat and lng are required and must be valid coordinates");
    }
    const km = Number(radiusKm);
    const radiusMeters = (Number.isFinite(km) && km > 0 ? Math.min(km, 50) : 5) * 1000;
    const ctx = req.tenantContext!;
    const ownerUserId =
      owner === "me" ? ctx.userId || "__nobody__" : owner === "unassigned" ? null : owner || undefined;
    return this.leadsService.nearby(ctx.tenantId, { latitude, longitude }, radiusMeters, {
      ownerUserId,
      visibility: visibleLeadsWhere(ctx),
    });
  }

  /** Declared before :id so "summary" isn't read as a lead id. */
  @Get("summary")
  summary(@Req() req: Request) {
    return this.leadsService.summary(req.tenantContext!.tenantId, visibleLeadsWhere(req.tenantContext!));
  }

  @Get(":id")
  get(@Req() req: Request, @Param("id") id: string) {
    return this.leadsService.get(req.tenantContext!.tenantId, id, visibleLeadsWhere(req.tenantContext!));
  }

  /** Agent-level: capturing and working leads is the day job, not an admin task. */
  @Post()
  create(@Req() req: Request, @Body() dto: CreateLeadDto) {
    return this.leadsService.create(req.tenantContext!.tenantId, dto, req.tenantContext!.userId);
  }

  @Patch(":id")
  update(@Req() req: Request, @Param("id") id: string, @Body() dto: UpdateLeadDto) {
    const ctx = req.tenantContext!;
    return this.leadsService.update(ctx.tenantId, id, dto, ctx.userId, visibleLeadsWhere(ctx));
  }

  @Delete(":id")
  remove(@Req() req: Request, @Param("id") id: string) {
    return this.leadsService.remove(req.tenantContext!.tenantId, id);
  }
}
