import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";

export class CatalogueEnquiryItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  productId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000)
  quantity!: number;
}

/** What a shopper submits from the public catalogue's "Request a quote" form. */
export class CatalogueEnquiryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(7)
  @MaxLength(24)
  phone!: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== "")
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  company?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CatalogueEnquiryItemDto)
  items!: CatalogueEnquiryItemDto[];

  /** Honeypot: hidden from people, so anything in it came from a bot. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;
}
