import { IsString, MaxLength, MinLength } from "class-validator";

export class ReplyMessageDto {
  @IsString()
  @MinLength(1)
  // Meta caps free-form text bodies at 4096 characters.
  @MaxLength(4096)
  body!: string;
}
