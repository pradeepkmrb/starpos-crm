import { Body, Controller, Get, Put, UseGuards } from "@nestjs/common";
import { PlatformSettingsService } from "./platform-settings.service";
import { PlatformAdminGuard } from "./platform-admin.guard";
import { UpdatePlatformSettingsDto } from "./dto/update-platform-settings.dto";
import { JwtAuthGuard } from "../memberships/jwt-auth.guard";

@Controller("platform")
@UseGuards(JwtAuthGuard)
export class PlatformSettingsController {
  constructor(private readonly platformSettingsService: PlatformSettingsService) {}

  /** Any logged-in user — needed by the channels page to decide whether to show the Embedded Signup button. */
  @Get("public-config")
  publicConfig() {
    return this.platformSettingsService.getPublicConfig();
  }

  @Get("settings")
  @UseGuards(PlatformAdminGuard)
  settings() {
    return this.platformSettingsService.getSettings();
  }

  @Put("settings")
  @UseGuards(PlatformAdminGuard)
  updateSettings(@Body() dto: UpdatePlatformSettingsDto) {
    return this.platformSettingsService.updateSettings(dto);
  }
}
