import { ArrayMaxSize, IsArray, IsString } from "class-validator";

export class ReorderLeadFieldsDto {
  /** Field ids in the order they should appear on the lead entry screen. */
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  ids!: string[];
}
