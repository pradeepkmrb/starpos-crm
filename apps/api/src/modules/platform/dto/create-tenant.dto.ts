import { IsEmail, IsString, MinLength } from "class-validator";

export class CreateTenantDto {
  @IsString()
  @MinLength(1)
  tenantName!: string;

  @IsString()
  @MinLength(1)
  ownerName!: string;

  @IsEmail()
  ownerEmail!: string;

  @MinLength(8)
  ownerPassword!: string;
}
