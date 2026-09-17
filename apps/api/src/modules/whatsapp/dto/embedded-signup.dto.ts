import { IsBoolean, IsOptional, IsString, MinLength } from "class-validator";

export class EmbeddedSignupDto {
  @IsString()
  @MinLength(1)
  code!: string;

  @IsString()
  @MinLength(1)
  wabaId!: string;

  /**
   * Meta's WhatsApp Business app (coexistence) finish event can omit this, in
   * which case the number is looked up from the WABA.
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  phoneNumberId?: string;

  /** The number stays on the WhatsApp Business app alongside Cloud API. */
  @IsOptional()
  @IsBoolean()
  coexistence?: boolean;
}
