import { Module } from "@nestjs/common";
import { IntegrationsService } from "./integrations.service";
import { IntegrationsController } from "./integrations.controller";
import { PaymentGatewayClient } from "./payment-gateway.client";

/**
 * Per-tenant connections to third-party services — today the tenant's own
 * payment gateway. IntegrationsService is exported so other features can ask
 * for a tenant's gateway credentials without reaching into the table (or the
 * encryption) themselves.
 */
@Module({
  controllers: [IntegrationsController],
  providers: [IntegrationsService, PaymentGatewayClient],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
