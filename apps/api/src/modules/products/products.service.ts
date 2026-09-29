import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type Product } from "@starpos-crm/db";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateProductDto } from "./dto/create-product.dto";
import { UpdateProductDto } from "./dto/update-product.dto";

/**
 * Prisma hands Decimal columns back as Decimal objects, which JSON-serialise
 * as strings. The catalogue UI does arithmetic on price and tax, so they are
 * converted once here and every route returns plain numbers.
 */
function serialize(product: Product) {
  return {
    ...product,
    price: product.price.toNumber(),
    taxPercent: product.taxPercent.toNumber(),
  };
}

export type SerializedProduct = ReturnType<typeof serialize>;

/** Catalogue order: the admin's arrangement, newest first among ties. */
export const CATALOGUE_ORDER: Prisma.ProductOrderByWithRelationInput[] = [{ sortOrder: "asc" }, { createdAt: "desc" }];

/** "" from a form field means "cleared", which is null in the database. */
function nullable(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string): Promise<SerializedProduct[]> {
    const products = await this.prisma.product.findMany({
      where: { tenantId },
      orderBy: CATALOGUE_ORDER,
    });
    return products.map(serialize);
  }

  async create(tenantId: string, dto: CreateProductDto): Promise<SerializedProduct> {
    const sku = nullable(dto.sku) ?? null;
    if (sku) await this.assertSkuIsFree(tenantId, sku);

    // A new product goes to the top, where the admin will look for it.
    const { _min } = await this.prisma.product.aggregate({ where: { tenantId }, _min: { sortOrder: true } });

    const product = await this.prisma.product.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        sku,
        description: nullable(dto.description) ?? null,
        price: new Prisma.Decimal(dto.price),
        currency: (dto.currency ?? "INR").toUpperCase(),
        stock: dto.stock ?? null,
        taxPercent: new Prisma.Decimal(dto.taxPercent ?? 0),
        taxName: nullable(dto.taxName) ?? null,
        category: nullable(dto.category) ?? null,
        imageUrl: nullable(dto.imageUrl) ?? null,
        sortOrder: (_min.sortOrder ?? 1) - 1,
      },
    });
    return serialize(product);
  }

  async update(tenantId: string, id: string, dto: UpdateProductDto): Promise<SerializedProduct> {
    const existing = await this.prisma.product.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!existing) throw new NotFoundException("Product not found");

    // Only the keys the caller actually sent are written, so editing one
    // field can't blank the rest.
    const data: Prisma.ProductUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.sku !== undefined) {
      const sku = nullable(dto.sku);
      if (sku) await this.assertSkuIsFree(tenantId, sku, id);
      data.sku = sku ?? null;
    }
    if (dto.description !== undefined) data.description = nullable(dto.description) ?? null;
    if (dto.price !== undefined) data.price = new Prisma.Decimal(dto.price);
    if (dto.currency !== undefined) data.currency = dto.currency.toUpperCase();
    if (dto.stock !== undefined) data.stock = dto.stock;
    if (dto.taxPercent !== undefined) data.taxPercent = new Prisma.Decimal(dto.taxPercent);
    if (dto.taxName !== undefined) data.taxName = nullable(dto.taxName) ?? null;
    if (dto.category !== undefined) data.category = nullable(dto.category) ?? null;
    if (dto.imageUrl !== undefined) data.imageUrl = nullable(dto.imageUrl) ?? null;

    return serialize(await this.prisma.product.update({ where: { id }, data }));
  }

  /**
   * Sets the catalogue order to exactly `ids`. The list must be every product
   * in the workspace, so a stale screen can't silently drop one from the order.
   */
  async reorder(tenantId: string, ids: string[]): Promise<SerializedProduct[]> {
    const existing = await this.prisma.product.findMany({ where: { tenantId }, select: { id: true } });
    const known = new Set(existing.map((p) => p.id));
    if (new Set(ids).size !== ids.length || ids.length !== known.size || ids.some((id) => !known.has(id))) {
      throw new BadRequestException("The catalogue changed since you loaded it — refresh and try again");
    }
    await this.prisma.$transaction(
      ids.map((id, sortOrder) => this.prisma.product.update({ where: { id }, data: { sortOrder } })),
    );
    return this.list(tenantId);
  }

  async remove(tenantId: string, id: string): Promise<{ id: string; deleted: boolean }> {
    const { count } = await this.prisma.product.deleteMany({ where: { id, tenantId } });
    if (count === 0) throw new NotFoundException("Product not found");
    return { id, deleted: true };
  }

  /**
   * The shareable catalogue behind /catalogue/<slug>. Unauthenticated, so it
   * resolves the tenant from the slug and pins every query to that tenantId
   * explicitly — the Prisma tenant-scoping safety net only covers requests
   * that arrive with a token.
   */
  async publicCatalogue(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, name: true, slug: true, status: true },
    });
    // A suspended workspace's catalogue goes dark along with the rest of it.
    if (!tenant || tenant.status !== "active") throw new NotFoundException("Catalogue not found");

    const products = await this.prisma.product.findMany({
      where: { tenantId: tenant.id },
      orderBy: CATALOGUE_ORDER,
    });

    return {
      tenant: { name: tenant.name, slug: tenant.slug },
      // tenantId is dropped: nothing on a shopper-facing page needs the
      // workspace's internal id.
      products: products.map((product) => {
        const { tenantId: _tenantId, ...rest } = serialize(product);
        return rest;
      }),
    };
  }

  /** The [tenantId, sku] unique index would otherwise surface as a raw P2002. */
  private async assertSkuIsFree(tenantId: string, sku: string, exceptProductId?: string) {
    const clash = await this.prisma.product.findFirst({
      where: { tenantId, sku, ...(exceptProductId ? { id: { not: exceptProductId } } : {}) },
      select: { id: true },
    });
    if (clash) throw new ConflictException(`A product with SKU "${sku}" already exists`);
  }
}
