import { IsString, MinLength } from "class-validator";

export class CreateChannelDto {
  @IsString()
  @MinLength(1)
  wabaId!: string;

  @IsString()
  @MinLength(1)
  phoneNumberId!: string;

  @IsString()
  @MinLength(1)
  displayPhoneNumber!: string;

  /** Plaintext in transit over HTTPS; encrypted at rest immediately on receipt. */
  @IsString()
  @MinLength(1)
  accessToken!: string;
}
