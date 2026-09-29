import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { ProductsService } from "./products.service";
import { CreateProductDto } from "./dto/create-product.dto";
import { UpdateProductDto } from "./dto/update-product.dto";
import { ReorderProductsDto } from "./dto/reorder-products.dto";
import { JwtAuthGuard } from "../memberships/jwt-auth.guard";
import { RolesGuard } from "../memberships/roles.guard";
import { Roles } from "../memberships/roles.decorator";
import "../../common/request-context";

@Controller("products")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  list(@Req() req: Request) {
    return this.productsService.list(req.tenantContext!.tenantId);
  }

  @Post()
  @Roles("admin")
  create(@Req() req: Request, @Body() dto: CreateProductDto) {
    return this.productsService.create(req.tenantContext!.tenantId, dto);
  }

  // Declared before ":id" routes so "order" is never read as a product id.
  @Put("order")
  @Roles("admin")
  reorder(@Req() req: Request, @Body() dto: ReorderProductsDto) {
    return this.productsService.reorder(req.tenantContext!.tenantId, dto.ids);
  }

  @Patch(":id")
  @Roles("admin")
  update(@Req() req: Request, @Param("id") id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(req.tenantContext!.tenantId, id, dto);
  }

  @Delete(":id")
  @Roles("admin")
  remove(@Req() req: Request, @Param("id") id: string) {
    return this.productsService.remove(req.tenantContext!.tenantId, id);
  }
}
