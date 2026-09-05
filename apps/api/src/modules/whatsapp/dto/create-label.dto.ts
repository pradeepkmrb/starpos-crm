import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { LABEL_COLORS, type LabelColor } from "../labels.service";

export class CreateLabelDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name!: string;

  @IsOptional()
  @IsIn(LABEL_COLORS as unknown as string[])
  color?: LabelColor;
}
