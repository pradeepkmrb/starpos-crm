import { ArrayMaxSize, IsArray, IsString } from "class-validator";

export class ReorderCustomFieldsDto {
  /** Field ids in the order they should appear on the entry screen. */
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  ids!: string[];
}
