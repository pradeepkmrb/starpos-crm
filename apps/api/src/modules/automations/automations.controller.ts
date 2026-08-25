import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { AutomationsService } from "./automations.service";
import { CreateAutomationDto } from "./dto/create-automation.dto";
import { JwtAuthGuard } from "../memberships/jwt-auth.guard";
import { RolesGuard } from "../memberships/roles.guard";
import { Roles } from "../memberships/roles.decorator";
import "../../common/request-context";

@Controller("automations")
@UseGuards(JwtAuthGuard, RolesGuard)
export class AutomationsController {
  constructor(private readonly automationsService: AutomationsService) {}

  @Get()
  list(@Req() req: Request) {
    return this.automationsService.listAutomations(req.tenantContext!.tenantId);
  }

  @Post()
  @Roles("admin")
  create(@Req() req: Request, @Body() dto: CreateAutomationDto) {
    return this.automationsService.createAutomation(req.tenantContext!.tenantId, dto);
  }

  @Post(":id/activate")
  @Roles("admin")
  activate(@Req() req: Request, @Param("id") id: string) {
    return this.automationsService.setActive(req.tenantContext!.tenantId, id, true);
  }

  @Post(":id/deactivate")
  @Roles("admin")
  deactivate(@Req() req: Request, @Param("id") id: string) {
    return this.automationsService.setActive(req.tenantContext!.tenantId, id, false);
  }

  @Delete(":id")
  @Roles("admin")
  remove(@Req() req: Request, @Param("id") id: string) {
    return this.automationsService.deleteAutomation(req.tenantContext!.tenantId, id);
  }
}
