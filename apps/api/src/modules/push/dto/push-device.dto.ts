import { IsIn, IsString, Matches, MaxLength } from "class-validator";

const EXPO_TOKEN = /^Expo(nent)?PushToken\[[^\]]+\]$/;

export class RegisterPushDeviceDto {
  @IsString()
  @MaxLength(200)
  @Matches(EXPO_TOKEN, { message: "token must be an Expo push token" })
  token!: string;

  @IsIn(["android", "ios"])
  platform!: string;
}

export class UnregisterPushDeviceDto {
  @IsString()
  @MaxLength(200)
  token!: string;
}
