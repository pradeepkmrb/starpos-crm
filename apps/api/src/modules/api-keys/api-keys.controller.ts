import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { IsOptional, IsString, MaxLength } from "class-validator";
import { ApiKeysService } from "./api-keys.service";
import { JwtAuthGuard } from "../memberships/jwt-auth.guard";
import { RolesGuard } from "../memberships/roles.guard";
import { Roles } from "../memberships/roles.decorator";
import "../../common/request-context";
import { Access } from "../roles/access.decorator";

export class RegenerateApiKeyDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;
}

/**
 * Dashboard-side management of the workspace's public-API credential. Admin
 * and above only, because the response carries the key in plaintext — the
 * API & Developers page reveals and copies it from here.
 */
@Controller("api-keys")
@UseGuards(JwtAuthGuard, RolesGuard)
@Access("developers")
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Get()
  current(@Req() req: Request) {
    return this.apiKeys.getOrCreateActiveKey(req.tenantContext!.tenantId);
  }

  /** Invalidates the old key immediately — anything using it starts failing. */
  @Post("regenerate")
  regenerate(@Req() req: Request, @Body() dto: RegenerateApiKeyDto) {
    return this.apiKeys.regenerate(req.tenantContext!.tenantId, dto.name);
  }

  @Post("revoke-all")
  @Roles("owner")
  revokeAll(@Req() req: Request) {
    return this.apiKeys.revokeAll(req.tenantContext!.tenantId);
  }
}
