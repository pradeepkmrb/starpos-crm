import { IsOptional, IsString, MinLength } from "class-validator";

export class AcceptInviteDto {
  @IsString()
  token!: string;

  /** Only required when accepting the invite creates a brand-new user. */
  @IsOptional()
  @MinLength(8)
  password?: string;

  @IsOptional()
  @IsString()
  name?: string;
}
