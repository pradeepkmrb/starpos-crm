import { Module } from "@nestjs/common";
import { WhatsappModule } from "../whatsapp/whatsapp.module";
import { MessagesModule } from "../messages/messages.module";
import {
  PaymentsController,
  PublicCatalogueEnquiriesController,
  PublicQuotationsController,
  QuotationsController,
  TargetsController,
} from "./sales.controllers";
import { QuotationsService } from "./quotations.service";
import { PaymentsService } from "./payments.service";
import { TargetsService } from "./targets.service";
import { CatalogueEnquiriesService } from "./catalogue-enquiries.service";

/**
 * Closing the deal: quotations (with a shareable PDF sent over WhatsApp),
 * payments received against them, and monthly sales targets.
 */
@Module({
  imports: [WhatsappModule, MessagesModule],
  controllers: [
    QuotationsController,
    PublicQuotationsController,
    PublicCatalogueEnquiriesController,
    PaymentsController,
    TargetsController,
  ],
  providers: [QuotationsService, PaymentsService, TargetsService, CatalogueEnquiriesService],
})
export class SalesModule {}
