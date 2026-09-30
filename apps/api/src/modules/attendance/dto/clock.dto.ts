import { IsLatitude, IsLongitude, IsOptional } from "class-validator";

/** Where the phone was when clocking in or out — optional, as location may be off. */
export class ClockDto {
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;
}
