import { Module } from "@nestjs/common";
import { ProductsService } from "./products.service";
import { ProductsController } from "./products.controller";
import { PublicCatalogueController } from "./public-catalogue.controller";

@Module({
  controllers: [ProductsController, PublicCatalogueController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
