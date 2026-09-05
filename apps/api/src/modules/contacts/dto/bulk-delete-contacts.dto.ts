import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsString } from "class-validator";

export class BulkDeleteContactsDto {
  @IsArray()
  @ArrayNotEmpty()
  // Bounded so one request can't ask the transaction to erase an unbounded set.
  @ArrayMaxSize(1000)
  @IsString({ each: true })
  ids!: string[];
}
