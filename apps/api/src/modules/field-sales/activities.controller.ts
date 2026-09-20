import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { roleAtLeast } from "@digitel/shared";
import { ActivitiesService, parseDate } from "./activities.service";
import { FieldSummaryService } from "./field-summary.service";
import { CheckInDto, CheckOutDto, CreateActivityDto, UpdateActivityDto } from "./dto/activity.dto";
import { JwtAuthGuard } from "../memberships/jwt-auth.guard";
import { RolesGuard } from "../memberships/roles.guard";
import { Roles } from "../memberships/roles.decorator";
import "../../common/request-context";

@Controller("activities")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}

  @Get()
  list(
    @Req() req: Request,
    @Query("leadId") leadId?: string,
    @Query("owner") owner?: string,
    @Query("status") status?: string,
    @Query("type") type?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("startedFrom") startedFrom?: string,
    @Query("startedTo") startedTo?: string,
    @Query("limit") limit?: string,
  ) {
    const parsed = Number(limit);
    const take = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 500) : 200;
    return this.activities.list(req.tenantContext!, {
      leadId,
      owner,
      status,
      type,
      from,
      to,
      startedFrom,
      startedTo,
      take,
    });
  }

  /** Agent-level, like leads: logging calls and visits is the day job. */
  @Post()
  @Roles("agent")
  create(@Req() req: Request, @Body() dto: CreateActivityDto) {
    return this.activities.create(req.tenantContext!, dto);
  }

  /** Start a visit at the rep's current location (see ActivitiesService.checkIn). */
  @Post("check-in")
  @Roles("agent")
  checkIn(@Req() req: Request, @Body() dto: CheckInDto) {
    return this.activities.checkIn(req.tenantContext!, dto);
  }

  @Post(":id/check-out")
  @Roles("agent")
  checkOut(@Req() req: Request, @Param("id") id: string, @Body() dto: CheckOutDto) {
    return this.activities.checkOut(req.tenantContext!, id, dto);
  }

  @Patch(":id")
  @Roles("agent")
  update(@Req() req: Request, @Param("id") id: string, @Body() dto: UpdateActivityDto) {
    return this.activities.update(req.tenantContext!, id, dto);
  }

  @Delete(":id")
  @Roles("agent")
  remove(@Req() req: Request, @Param("id") id: string) {
    return this.activities.remove(req.tenantContext!, id);
  }
}

@Controller("field")
@UseGuards(JwtAuthGuard, RolesGuard)
export class FieldController {
  constructor(private readonly summaryService: FieldSummaryService) {}

  /**
   * `scope=team` is for admins; anyone else always gets their own numbers.
   * Without explicit bounds the window falls back to UTC days.
   */
  @Get("summary")
  summary(
    @Req() req: Request,
    @Query("dayStart") dayStart?: string,
    @Query("dayEnd") dayEnd?: string,
    @Query("monthStart") monthStart?: string,
    @Query("scope") scope?: string,
  ) {
    const ctx = req.tenantContext!;
    const now = new Date();
    const utcMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const start = dayStart ? parseDate(dayStart, "dayStart") : utcMidnight;
    const window = {
      dayStart: start,
      dayEnd: dayEnd ? parseDate(dayEnd, "dayEnd") : new Date(start.getTime() + 24 * 60 * 60 * 1000),
      monthStart: monthStart
        ? parseDate(monthStart, "monthStart")
        : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    };
    const effectiveScope = scope === "team" && roleAtLeast(ctx.role, "admin") ? "team" : "me";
    return this.summaryService.summary(ctx, window, effectiveScope);
  }
}
