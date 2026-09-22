import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { PlatformDirectoryService } from "./platform-directory.service";
import { PlatformAdminGuard } from "./platform-admin.guard";
import { CreateTenantDto } from "./dto/create-tenant.dto";
import { SetTenantPlanDto } from "./dto/set-tenant-plan.dto";
import { JwtAuthGuard } from "../memberships/jwt-auth.guard";

@Controller("platform")
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class PlatformDirectoryController {
  constructor(private readonly platformDirectoryService: PlatformDirectoryService) {}

  @Get("tenants")
  listTenants() {
    return this.platformDirectoryService.listTenants();
  }

  @Post("tenants")
  createTenant(@Body() dto: CreateTenantDto) {
    return this.platformDirectoryService.createTenant(dto);
  }

  @Patch("tenants/:tenantId/plan")
  setTenantPlan(@Param("tenantId") tenantId: string, @Body() dto: SetTenantPlanDto) {
    return this.platformDirectoryService.setTenantPlan(tenantId, dto.planCode);
  }

  @Get("plans")
  listPlans() {
    return this.platformDirectoryService.listPlans();
  }

  @Get("channels")
  listChannels() {
    return this.platformDirectoryService.listChannels();
  }
}
