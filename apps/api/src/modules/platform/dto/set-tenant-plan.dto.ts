import { IsString, MinLength } from "class-validator";

export class SetTenantPlanDto {
  /** A Plan.code — "free", "professional", "enterprise". */
  @IsString()
  @MinLength(1)
  planCode!: string;
}
