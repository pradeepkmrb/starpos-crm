import { IsOptional, IsString, MinLength, ValidateIf } from "class-validator";

export class AssignConversationDto {
  /** null unassigns the conversation. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MinLength(1)
  userId!: string | null;
}
