import { IsEmail, IsString, MinLength } from "class-validator";

export class CreateInviteDto {
  @IsEmail()
  email!: string;

  /** One of the workspace's roles (GET /roles). */
  @IsString()
  @MinLength(1)
  roleId!: string;
}

export class SetMemberRoleDto {
  @IsString()
  @MinLength(1)
  roleId!: string;
}
