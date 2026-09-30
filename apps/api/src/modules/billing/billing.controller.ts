import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { BillingService } from "./billing.service";
import { CheckoutDto } from "./dto/checkout.dto";
import { JwtAuthGuard } from "../memberships/jwt-auth.guard";
import { RolesGuard } from "../memberships/roles.guard";
import { Roles } from "../memberships/roles.decorator";
import "../../common/request-context";
import { Access } from "../roles/access.decorator";

@Controller("billing")
@UseGuards(JwtAuthGuard, RolesGuard)
@Access("billing")
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get()
  overview(@Req() req: Request) {
    return this.billingService.getOverview(req.tenantContext!.tenantId);
  }

  @Post("checkout")
  @Roles("owner")
  checkout(@Req() req: Request, @Body() dto: CheckoutDto) {
    const { tenantId, userId } = req.tenantContext!;
    return this.billingService.startCheckout(tenantId, userId, dto.planCode);
  }
}
