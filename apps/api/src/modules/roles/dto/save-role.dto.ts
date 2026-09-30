import { IsBoolean, IsIn, IsObject, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import type { DataScope } from "@starpos-crm/shared";

export class SaveRoleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  /** { [menu key]: "none" | "view" | "edit" }; anything unrecognised is dropped by normalizePermissions. */
  @IsObject()
  permissions!: Record<string, string>;

  @IsIn(["all", "own"])
  dataScope!: DataScope;

  /** False = mobile app only; the web dashboard refuses the role's sign-ins. */
  @IsBoolean()
  webAccess!: boolean;
}
