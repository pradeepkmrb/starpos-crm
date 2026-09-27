import { IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from "class-validator";
import { IMAGE_PATH_PATTERN } from "../../media/media.constants";

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  /** A /media/images/:id path from POST /media/images; null removes the photo. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(IMAGE_PATH_PATTERN, { message: "avatarUrl must be an uploaded image" })
  avatarUrl?: string | null;
}
