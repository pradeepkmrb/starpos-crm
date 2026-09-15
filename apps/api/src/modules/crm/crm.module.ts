import { Module } from "@nestjs/common";
import { LeadsService } from "./leads.service";
import { LeadsController } from "./leads.controller";
import { LeadFieldsService } from "./lead-fields.service";
import { LeadFieldsController } from "./lead-fields.controller";
import { MetaLeadFormsService } from "./meta-lead-forms.service";
import { MetaLeadFormsController } from "./meta-lead-forms.controller";
import { MetaLeadsService } from "./meta-leads.service";
import { MetaLeadsClient } from "./meta-leads.client";

/**
 * The CRM: leads, the tenant-defined fields on the lead entry form, and the
 * Meta lead-ads forms that feed leads in automatically. MetaLeadsService is
 * exported because the Meta webhook processor (WhatsappModule) hands leadgen
 * notifications to it.
 */
@Module({
  controllers: [LeadsController, LeadFieldsController, MetaLeadFormsController],
  providers: [LeadsService, LeadFieldsService, MetaLeadFormsService, MetaLeadsService, MetaLeadsClient],
  exports: [MetaLeadsService, LeadFieldsService],
})
export class CrmModule {}
