import { IsBoolean, IsEmail, IsInt, IsOptional, IsString, Max, Min, MinLength } from "class-validator";

export class ConnectEmailDto {
  @IsString()
  @MinLength(3)
  imapHost!: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  imapPort!: number;

  @IsString()
  @MinLength(3)
  smtpHost!: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  smtpPort!: number;

  @IsEmail({}, { message: "Enter the mailbox address, e.g. support@yourbusiness.com" })
  emailAddress!: string;

  /**
   * Optional on update: left out, the stored password is kept, so an operator
   * editing the From name is not made to retype a 16-character app password.
   */
  @IsOptional()
  @IsString()
  @MinLength(4)
  password?: string;

  @IsOptional()
  @IsString()
  fromName?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
