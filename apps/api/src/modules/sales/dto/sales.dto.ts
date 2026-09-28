import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { PAYMENT_MODES, QUOTATION_STATUSES, type PaymentMode, type QuotationStatus } from "@starpos-crm/shared";

/** One line on a quotation. With a productId, missing name/price/tax come from the catalogue. */
export class QuotationItemDto {
  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  quantity!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  unitPricePaise?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  taxPercent?: number;
}

export class CreateQuotationDto {
  @IsString()
  @MinLength(1)
  leadId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => QuotationItemDto)
  items!: QuotationItemDto[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  discountPaise?: number;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsISO8601()
  validUntil?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(4000)
  notes?: string | null;
}

/** Items, discount and notes can change only while the quote is a draft; status any time. */
export class UpdateQuotationDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => QuotationItemDto)
  items?: QuotationItemDto[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  discountPaise?: number;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsISO8601()
  validUntil?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(4000)
  notes?: string | null;

  @IsOptional()
  @IsIn(QUOTATION_STATUSES as unknown as string[])
  status?: QuotationStatus;
}

export class BusinessProfileDto {
  @IsOptional() @IsString() @MaxLength(200) legalName?: string;
  @IsOptional() @IsString() @MaxLength(1000) address?: string;
  @IsOptional() @IsString() @MaxLength(20) gstin?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(200) email?: string;
  @IsOptional() @IsString() @MaxLength(4000) terms?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  validityDays?: number;
}

export class CreatePaymentDto {
  @IsString()
  @MinLength(1)
  leadId!: string;

  @IsOptional()
  @IsString()
  quotationId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  amountPaise!: number;

  @IsIn(PAYMENT_MODES as unknown as string[])
  mode!: PaymentMode;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  /** Defaults to now. */
  @IsOptional()
  @IsISO8601()
  receivedAt?: string;
}

export class SetTargetDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: "month must look like 2026-09" })
  month!: string;

  /** A rep's id, or null for the team target. */
  @ValidateIf((_, v) => v !== null)
  @IsString()
  userId!: string | null;

  /** 0 removes the target. */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  amountPaise!: number;
}
