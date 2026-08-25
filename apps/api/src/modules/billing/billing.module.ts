import { Module } from "@nestjs/common";
import { BillingService } from "./billing.service";
import { BillingController } from "./billing.controller";
import { RazorpayWebhooksController } from "./razorpay-webhooks.controller";
import { RazorpayProvider } from "./razorpay.provider";
import { PAYMENT_PROVIDER } from "./payment-provider.interface";

@Module({
  controllers: [BillingController, RazorpayWebhooksController],
  providers: [BillingService, { provide: PAYMENT_PROVIDER, useClass: RazorpayProvider }],
  exports: [BillingService],
})
export class BillingModule {}
