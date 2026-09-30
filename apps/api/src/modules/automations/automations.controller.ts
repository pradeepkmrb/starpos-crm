import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { AutomationsService } from "./automations.service";
import { CreateAutomationDto } from "./dto/create-automation.dto";
import { JwtAuthGuard } from "../memberships/jwt-auth.guard";
import "../../common/request-context";
import { Access } from "../roles/access.decorator";

@Controller("automations")
@UseGuards(JwtAuthGuard)
@Access("flows")
export class AutomationsController {
  constructor(private readonly automationsService: AutomationsService) {}

  @Get()
  list(@Req() req: Request) {
    return this.automationsService.listAutomations(req.tenantContext!.tenantId);
  }

  @Post()
  create(@Req() req: Request, @Body() dto: CreateAutomationDto) {
    return this.automationsService.createAutomation(req.tenantContext!.tenantId, dto);
  }

  @Post(":id/activate")
  activate(@Req() req: Request, @Param("id") id: string) {
    return this.automationsService.setActive(req.tenantContext!.tenantId, id, true);
  }

  @Post(":id/deactivate")
  deactivate(@Req() req: Request, @Param("id") id: string) {
    return this.automationsService.setActive(req.tenantContext!.tenantId, id, false);
  }

  @Delete(":id")
  remove(@Req() req: Request, @Param("id") id: string) {
    return this.automationsService.deleteAutomation(req.tenantContext!.tenantId, id);
  }
}
