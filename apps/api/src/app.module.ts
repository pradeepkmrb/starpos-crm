import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HealthModule } from "./modules/health/health.module";
import { PrismaModule } from "./prisma/prisma.module";
import { JwtCoreModule } from "./common/jwt-core.module";
import { TenantsModule } from "./modules/tenants/tenants.module";
import { TenantContextMiddleware } from "./modules/tenants/tenant-context.middleware";
import { MembershipsModule } from "./modules/memberships/memberships.module";
import { AuthModule } from "./modules/auth/auth.module";
import { BullmqCoreModule } from "./common/bullmq-core.module";
import { WhatsappModule } from "./modules/whatsapp/whatsapp.module";
import { ChannelsModule } from "./modules/channels/channels.module";
import { CampaignsModule } from "./modules/campaigns/campaigns.module";
import { AutomationsModule } from "./modules/automations/automations.module";
import { EntitlementsModule } from "./modules/entitlements/entitlements.module";
import { BillingModule } from "./modules/billing/billing.module";
import { AnalyticsModule } from "./modules/analytics/analytics.module";
import { PlatformModule } from "./modules/platform/platform.module";
import { CrmModule } from "./modules/crm/crm.module";
import { FieldSalesModule } from "./modules/field-sales/field-sales.module";
import { SalesModule } from "./modules/sales/sales.module";
import { IntegrationsModule } from "./modules/integrations/integrations.module";
import { ProductsModule } from "./modules/products/products.module";
import { ApiKeysModule } from "./modules/api-keys/api-keys.module";
import { PublicApiModule } from "./modules/public-api/public-api.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ["../../.env", ".env"] }),
    PrismaModule,
    JwtCoreModule,
    BullmqCoreModule,
    EntitlementsModule,
    HealthModule,
    TenantsModule,
    MembershipsModule,
    AuthModule,
    WhatsappModule,
    ChannelsModule,
    CampaignsModule,
    AutomationsModule,
    BillingModule,
    AnalyticsModule,
    PlatformModule,
    CrmModule,
    FieldSalesModule,
    SalesModule,
    IntegrationsModule,
    ProductsModule,
    ApiKeysModule,
    PublicApiModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantContextMiddleware).forRoutes("*");
  }
}
