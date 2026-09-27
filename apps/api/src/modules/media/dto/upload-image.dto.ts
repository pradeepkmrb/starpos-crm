import { IsBase64, IsIn, IsString, MaxLength } from "class-validator";
import { IMAGE_CONTENT_TYPES, MAX_IMAGE_BYTES } from "../media.constants";

export class UploadImageDto {
  @IsIn(IMAGE_CONTENT_TYPES as unknown as string[])
  contentType!: string;

  /** The picture as base64 — the phone already shrank it, so JSON is fine. */
  @IsString()
  @IsBase64()
  @MaxLength(Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 4)
  data!: string;
}
