import { Body, Controller, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { AttendanceService } from "./attendance.service";
import { ClockDto } from "./dto/clock.dto";
import { JwtAuthGuard } from "../memberships/jwt-auth.guard";
import { Access } from "../roles/access.decorator";
import "../../common/request-context";

/** Every member clocks their own day; the team view is for people who manage visits or the team. */
@Controller("attendance")
@UseGuards(JwtAuthGuard)
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get("today")
  today(@Req() req: Request) {
    return this.attendance.today(req.tenantContext!);
  }

  @Post("clock-in")
  clockIn(@Req() req: Request, @Body() dto: ClockDto) {
    return this.attendance.clockIn(req.tenantContext!, dto);
  }

  @Post("clock-out")
  clockOut(@Req() req: Request, @Body() dto: ClockDto) {
    return this.attendance.clockOut(req.tenantContext!, dto);
  }

  @Get("team")
  @Access({ view: ["team", "visits"] })
  team(@Req() req: Request, @Query("day") day?: string) {
    return this.attendance.team(req.tenantContext!, day);
  }
}
