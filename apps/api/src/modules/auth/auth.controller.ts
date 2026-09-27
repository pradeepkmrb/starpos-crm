import { Body, Controller, Get, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { AuthService } from "./auth.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { RefreshDto } from "./dto/refresh.dto";
import { SwitchTenantDto } from "./dto/switch-tenant.dto";
import { AcceptInviteDto } from "./dto/accept-invite.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { JwtAuthGuard } from "../memberships/jwt-auth.guard";
import "../../common/request-context";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post("refresh")
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post("accept-invite")
  acceptInvite(@Body() dto: AcceptInviteDto) {
    return this.authService.acceptInvite(dto);
  }

  @Post("switch-tenant")
  @UseGuards(JwtAuthGuard)
  switchTenant(@Req() req: Request, @Body() dto: SwitchTenantDto) {
    return this.authService.switchTenant(req.tenantContext!.userId, dto.tenantId);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@Req() req: Request) {
    const { userId, tenantId } = req.tenantContext!;
    return this.authService.me(userId, tenantId);
  }

  /** The signed-in user edits their own name and photo. */
  @Patch("me")
  @UseGuards(JwtAuthGuard)
  async updateMe(@Req() req: Request, @Body() dto: UpdateProfileDto) {
    const { userId, tenantId } = req.tenantContext!;
    await this.authService.updateProfile(userId, dto);
    return this.authService.me(userId, tenantId);
  }
}
