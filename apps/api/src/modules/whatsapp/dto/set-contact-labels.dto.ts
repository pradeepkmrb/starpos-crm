import { ArrayMaxSize, IsArray, IsString } from "class-validator";

export class SetContactLabelsDto {
  /** The complete set of labels for the contact; an empty array clears them. */
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  labelIds!: string[];
}
