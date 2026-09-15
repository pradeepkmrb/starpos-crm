import { Controller, Get, Param } from "@nestjs/common";
import { ProductsService } from "./products.service";

/**
 * Deliberately unguarded: this is what the "Copy link" / "Share catalogue"
 * buttons hand to a shopper on WhatsApp. It exposes only the tenant's display
 * name and its products — no contacts, no channels, no settings.
 */
@Controller("public/catalogue")
export class PublicCatalogueController {
  constructor(private readonly productsService: ProductsService) {}

  @Get(":slug")
  get(@Param("slug") slug: string) {
    return this.productsService.publicCatalogue(slug);
  }
}
