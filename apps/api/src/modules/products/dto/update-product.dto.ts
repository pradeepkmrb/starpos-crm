import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from "class-validator";
import { PRODUCT_IMAGE_MESSAGE, PRODUCT_IMAGE_PATTERN } from "./product-image";

/**
 * Every field is optional so a patch touches only what the operator edited.
 * The nullable text fields accept "" from the form and are stored as null —
 * see ProductsService.update.
 */
export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99_999_999)
  price?: number;

  @IsOptional()
  @Matches(/^[A-Za-z]{3}$/, { message: "currency must be a 3-letter ISO-4217 code" })
  currency?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  taxPercent?: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  taxName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  // "" clears the image, so the URL check only applies to a real value.
  @IsOptional()
  @ValidateIf((o: UpdateProductDto) => o.imageUrl !== "")
  @Matches(PRODUCT_IMAGE_PATTERN, { message: PRODUCT_IMAGE_MESSAGE })
  @MaxLength(2000)
  imageUrl?: string;
}
