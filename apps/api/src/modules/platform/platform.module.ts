import { Module } from "@nestjs/common";
import { PlatformSettingsService } from "./platform-settings.service";
import { PlatformSettingsController } from "./platform-settings.controller";
import { PlatformAdminGuard } from "./platform-admin.guard";

@Module({
  controllers: [PlatformSettingsController],
  providers: [PlatformSettingsService, PlatformAdminGuard],
  exports: [PlatformSettingsService],
})
export class PlatformModule {}
