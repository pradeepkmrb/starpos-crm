import { IsIn } from "class-validator";
import type { PlanCode } from "@digitel/shared";

const PAID_PLAN_CODES: PlanCode[] = ["professional", "enterprise"];

export class CheckoutDto {
  @IsIn(PAID_PLAN_CODES)
  planCode!: PlanCode;
}
