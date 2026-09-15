import { ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@digitel/db";
import { ProductsService } from "./products.service";
import type { PrismaService } from "../../prisma/prisma.service";

function buildProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    tenantId: "t1",
    name: "Silk Saree",
    sku: "SAR-001",
    description: "Handwoven",
    price: new Prisma.Decimal("2499.50"),
    currency: "INR",
    stock: 12,
    taxPercent: new Prisma.Decimal("5"),
    taxName: "GST",
    category: "Sarees",
    imageUrl: null,
    createdAt: new Date("2026-09-01T00:00:00Z"),
    updatedAt: new Date("2026-09-01T00:00:00Z"),
    ...overrides,
  };
}

function buildService(overrides: { existingProduct?: unknown; tenant?: unknown } = {}) {
  const prisma = {
    product: {
      findMany: jest.fn().mockResolvedValue([buildProduct()]),
      findFirst: jest.fn().mockResolvedValue(overrides.existingProduct ?? null),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve(buildProduct(data))),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve(buildProduct(data))),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    tenant: { findUnique: jest.fn().mockResolvedValue(overrides.tenant ?? null) },
  } as unknown as PrismaService;

  return { service: new ProductsService(prisma), prisma };
}

describe("ProductsService", () => {
  describe("list", () => {
    it("returns price and tax as numbers, not Decimals", async () => {
      const { service } = buildService();
      const [product] = await service.list("t1");
      expect(product.price).toBe(2499.5);
      expect(product.taxPercent).toBe(5);
    });
  });

  describe("create", () => {
    it("defaults currency and tax, and stores blank optional fields as null", async () => {
      const { service, prisma } = buildService();
      await service.create("t1", { name: "  Gift Card  ", price: 500, sku: "  ", description: "" });

      const { data } = (prisma.product.create as jest.Mock).mock.calls[0][0];
      expect(data).toMatchObject({ tenantId: "t1", name: "Gift Card", currency: "INR", sku: null, description: null });
      expect(data.price).toEqual(new Prisma.Decimal(500));
      expect(data.taxPercent).toEqual(new Prisma.Decimal(0));
      // Untracked rather than zero: a blank stock field is not "sold out".
      expect(data.stock).toBeNull();
    });

    it("upper-cases the currency code", async () => {
      const { service, prisma } = buildService();
      await service.create("t1", { name: "Mug", price: 9, currency: "usd" });
      expect((prisma.product.create as jest.Mock).mock.calls[0][0].data.currency).toBe("USD");
    });

    it("rejects a SKU already used in the same tenant", async () => {
      const { service } = buildService({ existingProduct: { id: "other" } });
      await expect(service.create("t1", { name: "Copy", price: 1, sku: "SAR-001" })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe("update", () => {
    it("writes only the fields the caller sent", async () => {
      const { service, prisma } = buildService({ existingProduct: { id: "p1" } });
      await service.update("t1", "p1", { price: 2999 });

      const { data } = (prisma.product.update as jest.Mock).mock.calls[0][0];
      expect(Object.keys(data)).toEqual(["price"]);
    });

    it('treats "" as clearing an optional field', async () => {
      const { service, prisma } = buildService({ existingProduct: { id: "p1" } });
      await service.update("t1", "p1", { sku: "", category: "" });

      const { data } = (prisma.product.update as jest.Mock).mock.calls[0][0];
      expect(data).toEqual({ sku: null, category: null });
    });

    it("404s on a product belonging to another tenant", async () => {
      const { service } = buildService({ existingProduct: null });
      await expect(service.update("t1", "p1", { price: 1 })).rejects.toThrow(NotFoundException);
    });
  });

  describe("remove", () => {
    it("404s when the id matches nothing in this tenant", async () => {
      const { service, prisma } = buildService();
      (prisma.product.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
      await expect(service.remove("t1", "p1")).rejects.toThrow(NotFoundException);
    });
  });

  describe("publicCatalogue", () => {
    it("404s for an unknown slug", async () => {
      const { service } = buildService({ tenant: null });
      await expect(service.publicCatalogue("nope")).rejects.toThrow(NotFoundException);
    });

    it("404s for a suspended workspace", async () => {
      const { service } = buildService({
        tenant: { id: "t1", name: "Dreamy Store", slug: "dreamy-store", status: "suspended" },
      });
      await expect(service.publicCatalogue("dreamy-store")).rejects.toThrow(NotFoundException);
    });

    it("scopes the query to the slug's tenant and hides the internal tenantId", async () => {
      const { service, prisma } = buildService({
        tenant: { id: "t1", name: "Dreamy Store", slug: "dreamy-store", status: "active" },
      });
      const result = await service.publicCatalogue("dreamy-store");

      expect((prisma.product.findMany as jest.Mock).mock.calls[0][0].where).toEqual({ tenantId: "t1" });
      expect(result.tenant).toEqual({ name: "Dreamy Store", slug: "dreamy-store" });
      expect(result.products[0]).not.toHaveProperty("tenantId");
      expect(result.products[0].price).toBe(2499.5);
    });
  });
});
