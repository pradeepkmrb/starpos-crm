import { ArrayMaxSize, IsArray, IsString } from "class-validator";

/** Every product id in the workspace, in the order the catalogue should show them. */
export class ReorderProductsDto {
  @IsArray()
  @ArrayMaxSize(5000)
  @IsString({ each: true })
  ids!: string[];
}
