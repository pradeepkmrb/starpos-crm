import { IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from "class-validator";
import { PRODUCT_IMAGE_MESSAGE, PRODUCT_IMAGE_PATTERN } from "./product-image";

export class CreateProductDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  /** Major units (rupees, dollars) — see the Product model's price field. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99_999_999)
  price!: number;

  @IsOptional()
  @Matches(/^[A-Za-z]{3}$/, { message: "currency must be a 3-letter ISO-4217 code" })
  currency?: string;

  /** Omit (or null) to leave stock untracked; 0 means sold out. */
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

  @IsOptional()
  @Matches(PRODUCT_IMAGE_PATTERN, { message: PRODUCT_IMAGE_MESSAGE })
  @MaxLength(2000)
  imageUrl?: string;
}
