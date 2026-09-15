import { IsBoolean, IsOptional, IsString, Matches, MinLength } from "class-validator";

export class ConnectMessengerDto {
  /** Numeric Page id from the Meta App Dashboard. */
  @Matches(/^\d{5,}$/, { message: "Facebook Page ID must be the numeric id from your Page settings" })
  pageId!: string;

  @IsString()
  @MinLength(20, { message: "That does not look like a Page access token" })
  accessToken!: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
