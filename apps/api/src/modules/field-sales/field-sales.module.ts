import { Module } from "@nestjs/common";
import { ActivitiesController, FieldController } from "./activities.controller";
import { ActivitiesService } from "./activities.service";
import { FieldSummaryService } from "./field-summary.service";

/**
 * Field sales: the calls, visits, demos, follow-ups and notes reps log
 * against leads, and the per-rep summary that drives the mobile home screen.
 */
@Module({
  controllers: [ActivitiesController, FieldController],
  providers: [ActivitiesService, FieldSummaryService],
})
export class FieldSalesModule {}
