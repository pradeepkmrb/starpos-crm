import { Module } from "@nestjs/common";
import { TenantsService } from "./tenants.service";
import { TenantContextMiddleware } from "./tenant-context.middleware";

@Module({
  providers: [TenantsService, TenantContextMiddleware],
  exports: [TenantsService, TenantContextMiddleware],
})
export class TenantsModule {}
