import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { IntegrationsService } from "./integrations.service";
import { ConnectIntegrationDto } from "./dto/connect-integration.dto";
import { SetIntegrationActiveDto } from "./dto/set-integration-active.dto";
import { JwtAuthGuard } from "../memberships/jwt-auth.guard";
import { RolesGuard } from "../memberships/roles.guard";
import { Roles } from "../memberships/roles.decorator";
import "../../common/request-context";

/**
 * Every route is tenant-scoped through req.tenantContext, so a workspace only
 * ever sees and edits its own connections. Connecting a payment gateway is
 * admin-level work; reading the catalog is not.
 */
@Controller("integrations")
@UseGuards(JwtAuthGuard, RolesGuard)
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get()
  list(@Req() req: Request) {
    return this.integrations.list(req.tenantContext!.tenantId);
  }

  @Get(":provider")
  get(@Req() req: Request, @Param("provider") provider: string) {
    return this.integrations.get(req.tenantContext!.tenantId, provider);
  }

  /** Connects the provider, or replaces the keys of one already connected. */
  @Post(":provider/connect")
  @Roles("admin")
  connect(
    @Req() req: Request,
    @Param("provider") provider: string,
    @Body() dto: ConnectIntegrationDto,
  ) {
    const { tenantId, userId } = req.tenantContext!;
    return this.integrations.connect(tenantId, provider, dto.credentials, userId);
  }

  /** Re-checks the stored keys against the provider and records the result. */
  @Post(":provider/test")
  @Roles("admin")
  test(@Req() req: Request, @Param("provider") provider: string) {
    return this.integrations.test(req.tenantContext!.tenantId, provider);
  }

  @Patch(":provider")
  @Roles("admin")
  setActive(
    @Req() req: Request,
    @Param("provider") provider: string,
    @Body() dto: SetIntegrationActiveDto,
  ) {
    return this.integrations.setActive(req.tenantContext!.tenantId, provider, dto.isActive);
  }

  /** Disconnects and erases the stored credentials. */
  @Delete(":provider")
  @Roles("admin")
  disconnect(@Req() req: Request, @Param("provider") provider: string) {
    return this.integrations.disconnect(req.tenantContext!.tenantId, provider);
  }
}
