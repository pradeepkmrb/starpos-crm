import { IsBoolean } from "class-validator";

export class SetIntegrationActiveDto {
  /** False pauses the connection without discarding its credentials. */
  @IsBoolean()
  isActive!: boolean;
}
