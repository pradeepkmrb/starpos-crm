import { Module } from "@nestjs/common";
import { TenantsService } from "./tenants.service";
import { TenantContextMiddleware } from "./tenant-context.middleware";
import { ApiKeysModule } from "../api-keys/api-keys.module";

@Module({
  imports: [ApiKeysModule],
  providers: [TenantsService, TenantContextMiddleware],
  exports: [TenantsService, TenantContextMiddleware],
})
export class TenantsModule {}
