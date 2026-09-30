import { IsEmail, IsIn, IsOptional, IsString } from "class-validator";

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;

  /** The mobile app sends "mobile"; anything else is the web dashboard. */
  @IsOptional()
  @IsIn(["web", "mobile"])
  client?: "web" | "mobile";
}
