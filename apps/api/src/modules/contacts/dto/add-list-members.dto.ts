import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsString } from "class-validator";

export class AddListMembersDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(5000)
  @IsString({ each: true })
  contactIds!: string[];
}
