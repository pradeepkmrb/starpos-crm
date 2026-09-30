import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { CampaignsService } from "./campaigns.service";
import { CreateCampaignDto } from "./dto/create-campaign.dto";
import { JwtAuthGuard } from "../memberships/jwt-auth.guard";
import "../../common/request-context";
import { Access } from "../roles/access.decorator";

@Controller("campaigns")
@UseGuards(JwtAuthGuard)
@Access("broadcasts")
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get()
  list(@Req() req: Request) {
    return this.campaignsService.listCampaigns(req.tenantContext!.tenantId);
  }

  @Get(":id")
  get(@Req() req: Request, @Param("id") id: string) {
    return this.campaignsService.getCampaign(req.tenantContext!.tenantId, id);
  }

  @Post()
  launch(@Req() req: Request, @Body() dto: CreateCampaignDto) {
    return this.campaignsService.launchCampaign(req.tenantContext!.tenantId, dto);
  }
}
