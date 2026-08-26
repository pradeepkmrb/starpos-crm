import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { PlatformDirectoryService } from "./platform-directory.service";
import { PlatformAdminGuard } from "./platform-admin.guard";
import { CreateTenantDto } from "./dto/create-tenant.dto";
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

  @Get("channels")
  listChannels() {
    return this.platformDirectoryService.listChannels();
  }
}
