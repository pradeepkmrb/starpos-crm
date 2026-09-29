import { BadRequestException, HttpException, NotFoundException } from "@nestjs/common";
import { CatalogueEnquiriesService } from "./catalogue-enquiries.service";
import type { CatalogueEnquiryDto } from "./dto/catalogue-enquiry.dto";
import type { PrismaService } from "../../prisma/prisma.service";
import type { QuotationsService } from "./quotations.service";
import type { PushService } from "../push/push.service";

const LEAD_SELECT_RESULT = { id: "lead-new", name: "Asha", phone: "98765 43210", ownerUserId: null, valuePaise: null };

function buildService(overrides: { tenant?: unknown; products?: unknown[]; leads?: unknown[] } = {}) {
  const prisma = {
    tenant: {
      findUnique: jest.fn().mockResolvedValue(
        "tenant" in overrides ? overrides.tenant : { id: "t1", status: "active" },
      ),
    },
    product: {
      findMany: jest.fn().mockResolvedValue(
        overrides.products ?? [
          { id: "p1", name: "B-POS" },
          { id: "p2", name: "Captain App" },
        ],
      ),
    },
    lead: {
      findMany: jest.fn().mockResolvedValue(overrides.leads ?? []),
      create: jest.fn().mockResolvedValue(LEAD_SELECT_RESULT),
      update: jest.fn().mockResolvedValue({}),
    },
    activity: { create: jest.fn().mockResolvedValue({}) },
    tenantMembership: { findMany: jest.fn().mockResolvedValue([{ userId: "owner-1" }]) },
  };
  const quotations = { create: jest.fn().mockResolvedValue({ number: "QT-1001", totalPaise: 1_000_000 }) };
  const push = { notifyUsers: jest.fn().mockResolvedValue(undefined) };
  const service = new CatalogueEnquiriesService(
    prisma as unknown as PrismaService,
    quotations as unknown as QuotationsService,
    push as unknown as PushService,
  );
  return { service, prisma, quotations, push };
}

function enquiry(overrides: Partial<CatalogueEnquiryDto> = {}): CatalogueEnquiryDto {
  return {
    name: "Asha",
    phone: "98765 43210",
    items: [
      { productId: "p1", quantity: 2 },
      { productId: "p2", quantity: 1 },
    ],
    ...overrides,
  };
}

describe("CatalogueEnquiriesService", () => {
  it("creates a catalogue lead, a draft quotation with the quantities, and a timeline note", async () => {
    const { service, prisma, quotations, push } = buildService();
    const result = await service.submit("starpos", enquiry({ message: "Deliver to Chennai" }), "1.1.1.1");

    expect(result).toEqual({ ok: true, reference: "QT-1001" });
    expect(prisma.lead.create.mock.calls[0][0].data).toMatchObject({ tenantId: "t1", source: "catalogue", status: "new" });
    expect(quotations.create).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "t1", userId: "" }),
      expect.objectContaining({
        leadId: "lead-new",
        items: [
          { productId: "p1", quantity: 2 },
          { productId: "p2", quantity: 1 },
        ],
      }),
    );
    const note = prisma.activity.create.mock.calls[0][0].data.notes as string;
    expect(note).toContain("2 × B-POS");
    expect(note).toContain("Deliver to Chennai");
    expect(prisma.lead.update).toHaveBeenCalledWith({ where: { id: "lead-new" }, data: { valuePaise: 1_000_000 } });
    await new Promise(process.nextTick);
    expect(push.notifyUsers).toHaveBeenCalledWith("t1", ["owner-1"], expect.objectContaining({ url: "/lead/lead-new" }));
  });

  it("reuses an open lead with the same number, however it was formatted", async () => {
    const existing = { id: "lead-old", name: "Asha", phone: "+91-98765-43210", ownerUserId: "rep-1", valuePaise: 50_000 };
    const { service, prisma, quotations, push } = buildService({ leads: [existing] });
    await service.submit("starpos", enquiry({ phone: "9876543210" }), "1.1.1.1");

    expect(prisma.lead.create).not.toHaveBeenCalled();
    expect(quotations.create.mock.calls[0][1].leadId).toBe("lead-old");
    // An existing deal value is the rep's; it isn't overwritten.
    expect(prisma.lead.update).not.toHaveBeenCalled();
    await new Promise(process.nextTick);
    expect(push.notifyUsers).toHaveBeenCalledWith("t1", ["rep-1"], expect.anything());
  });

  it("merges repeated lines for the same product", async () => {
    const { service, quotations } = buildService({ products: [{ id: "p1", name: "B-POS" }] });
    await service.submit(
      "starpos",
      enquiry({ items: [{ productId: "p1", quantity: 2 }, { productId: "p1", quantity: 3 }] }),
      "1.1.1.1",
    );
    expect(quotations.create.mock.calls[0][1].items).toEqual([{ productId: "p1", quantity: 5 }]);
  });

  it("rejects products that aren't in this catalogue", async () => {
    const { service, quotations } = buildService({ products: [{ id: "p1", name: "B-POS" }] });
    await expect(service.submit("starpos", enquiry(), "1.1.1.1")).rejects.toBeInstanceOf(BadRequestException);
    expect(quotations.create).not.toHaveBeenCalled();
  });

  it("rejects an implausible phone number", async () => {
    const { service } = buildService();
    await expect(service.submit("starpos", enquiry({ phone: "12ab" }), "1.1.1.1")).rejects.toThrow("valid phone");
  });

  it("404s for an unknown or suspended workspace", async () => {
    await expect(buildService({ tenant: null }).service.submit("nope", enquiry(), "1.1.1.1")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      buildService({ tenant: { id: "t1", status: "suspended" } }).service.submit("starpos", enquiry(), "1.1.1.1"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("silently drops a submission that filled the honeypot", async () => {
    const { service, prisma } = buildService();
    await expect(service.submit("starpos", enquiry({ website: "spam.example" }), "1.1.1.1")).resolves.toEqual({
      ok: true,
      reference: null,
    });
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
  });

  it("rate limits one shopper after five requests", async () => {
    const { service } = buildService();
    for (let i = 0; i < 5; i++) await service.submit("starpos", enquiry(), "2.2.2.2");
    await expect(service.submit("starpos", enquiry(), "2.2.2.2")).rejects.toBeInstanceOf(HttpException);
    // Someone else is unaffected.
    await expect(service.submit("starpos", enquiry(), "3.3.3.3")).resolves.toMatchObject({ ok: true });
  });
});
