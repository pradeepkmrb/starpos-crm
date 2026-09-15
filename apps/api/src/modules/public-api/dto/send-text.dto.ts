import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class SendTextDto {
  /** Destination in E.164; "+" and separators are accepted and stripped. */
  @IsString()
  @MinLength(7)
  to!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  text!: string;

  /** Renders a link preview for the first URL in the body. */
  @IsOptional()
  @IsBoolean()
  previewUrl?: boolean;

  /** Defaults to the workspace's only active channel when omitted. */
  @IsOptional()
  @IsString()
  channelId?: string;
}
