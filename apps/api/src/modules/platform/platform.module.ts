import { Module } from "@nestjs/common";
import { PlatformSettingsService } from "./platform-settings.service";
import { PlatformSettingsController } from "./platform-settings.controller";
import { PlatformDirectoryService } from "./platform-directory.service";
import { PlatformDirectoryController } from "./platform-directory.controller";
import { PlatformAdminGuard } from "./platform-admin.guard";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [PlatformSettingsController, PlatformDirectoryController],
  providers: [PlatformSettingsService, PlatformDirectoryService, PlatformAdminGuard],
  exports: [PlatformSettingsService],
})
export class PlatformModule {}
