import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { RolesService } from "./roles.service";
import { SaveRoleDto } from "./dto/save-role.dto";
import { JwtAuthGuard } from "../memberships/jwt-auth.guard";
import { Access } from "./access.decorator";
import "../../common/request-context";

@Controller("roles")
@UseGuards(JwtAuthGuard)
@Access("team")
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  list(@Req() req: Request) {
    return this.roles.list(req.tenantContext!.tenantId);
  }

  @Post()
  create(@Req() req: Request, @Body() dto: SaveRoleDto) {
    return this.roles.create(req.tenantContext!.tenantId, dto);
  }

  @Patch(":id")
  update(@Req() req: Request, @Param("id") id: string, @Body() dto: SaveRoleDto) {
    return this.roles.update(req.tenantContext!.tenantId, id, dto);
  }

  @Delete(":id")
  remove(@Req() req: Request, @Param("id") id: string) {
    return this.roles.remove(req.tenantContext!.tenantId, id);
  }
}
