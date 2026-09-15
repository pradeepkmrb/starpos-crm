import { Module } from "@nestjs/common";
import { LeadsService } from "./leads.service";
import { LeadsController } from "./leads.controller";
import { CustomFieldsModule } from "../custom-fields/custom-fields.module";
import { MetaLeadFormsService } from "./meta-lead-forms.service";
import { MetaLeadFormsController } from "./meta-lead-forms.controller";
import { MetaLeadsService } from "./meta-leads.service";
import { MetaLeadsClient } from "./meta-leads.client";

/**
 * The CRM: leads and the Meta lead-ads forms that feed them in
 * automatically. The lead entry form's tenant-defined fields come from the
 * shared CustomFieldsModule. MetaLeadsService is
 * exported because the Meta webhook processor (WhatsappModule) hands leadgen
 * notifications to it.
 */
@Module({
  imports: [CustomFieldsModule],
  controllers: [LeadsController, MetaLeadFormsController],
  providers: [LeadsService, MetaLeadFormsService, MetaLeadsService, MetaLeadsClient],
  exports: [MetaLeadsService],
})
export class CrmModule {}
