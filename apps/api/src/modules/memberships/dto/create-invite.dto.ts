import { IsEmail, IsIn } from "class-validator";
import type { TenantRole } from "@starpos-crm/shared";

const INVITABLE_ROLES: TenantRole[] = ["admin", "agent", "viewer"];

export class CreateInviteDto {
  @IsEmail()
  email!: string;

  @IsIn(INVITABLE_ROLES)
  role!: TenantRole;
}
