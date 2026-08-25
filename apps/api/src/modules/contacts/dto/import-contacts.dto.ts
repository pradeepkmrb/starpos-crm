import { IsString, MinLength } from "class-validator";

export class ImportContactsDto {
  @IsString()
  @MinLength(1)
  listName!: string;

  @IsString()
  @MinLength(1)
  csvText!: string;
}
