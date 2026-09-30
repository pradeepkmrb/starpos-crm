import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { AnalyticsService } from "./analytics.service";
import { AnalyticsQueryDto } from "./dto/analytics-query.dto";
import { JwtAuthGuard } from "../memberships/jwt-auth.guard";
import "../../common/request-context";
import { Access } from "../roles/access.decorator";

@Controller("analytics")
@UseGuards(JwtAuthGuard)
@Access("analytics")
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get("overview")
  overview(@Req() req: Request, @Query() query: AnalyticsQueryDto) {
    return this.analyticsService.getOverview(req.tenantContext!.tenantId, query.days ?? 14, query.channelId);
  }
}
