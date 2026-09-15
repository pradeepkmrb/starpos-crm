import { Module } from "@nestjs/common";
import { CustomFieldsService } from "./custom-fields.service";
import { ContactFieldsController, LeadFieldsController } from "./custom-fields.controller";

/**
 * The one field builder behind every entry screen that has one. Exported so
 * the features that own those screens (CRM leads, contacts) validate answers
 * against the same definitions the builder writes.
 */
@Module({
  controllers: [LeadFieldsController, ContactFieldsController],
  providers: [CustomFieldsService],
  exports: [CustomFieldsService],
})
export class CustomFieldsModule {}
