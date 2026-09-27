import { Body, Controller, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { PushService } from "./push.service";
import { RegisterPushDeviceDto, UnregisterPushDeviceDto } from "./dto/push-device.dto";
import { JwtAuthGuard } from "../memberships/jwt-auth.guard";
import "../../common/request-context";

@Controller("push/devices")
@UseGuards(JwtAuthGuard)
export class PushController {
  constructor(private readonly push: PushService) {}

  /** The phone app calls this after sign-in with its Expo push token. */
  @Post()
  register(@Req() req: Request, @Body() dto: RegisterPushDeviceDto) {
    const { tenantId, userId } = req.tenantContext!;
    return this.push.registerDevice(tenantId, userId, dto.token, dto.platform);
  }

  /** Called on sign-out, so the next person to use the phone doesn't get this user's alerts. */
  @Post("unregister")
  @HttpCode(200)
  unregister(@Req() req: Request, @Body() dto: UnregisterPushDeviceDto) {
    return this.push.unregisterDevice(req.tenantContext!.userId, dto.token);
  }
}
