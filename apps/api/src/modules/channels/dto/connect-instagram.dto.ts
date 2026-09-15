import { IsBoolean, IsOptional, IsString, Matches, MinLength } from "class-validator";

export class ConnectInstagramDto {
  /** Instagram business account id — the one that starts 17841…. */
  @Matches(/^\d{5,}$/, {
    message: "Instagram Account ID must be the numeric id returned by instagram_business_account",
  })
  instagramAccountId!: string;

  /**
   * Optional: with a Messenger channel already connected, its Page token is
   * reused, matching what the setup instructions tell the operator.
   */
  @IsOptional()
  @IsString()
  @MinLength(20, { message: "That does not look like a Page access token" })
  accessToken?: string;

  @IsOptional()
  @Matches(/^\d{5,}$/, { message: "Facebook Page ID must be numeric" })
  pageId?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
