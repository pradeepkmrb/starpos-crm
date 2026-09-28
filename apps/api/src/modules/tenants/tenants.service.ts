import { Injectable } from "@nestjs/common";
import type { Prisma } from "@starpos-crm/db";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Accepts an optional transaction client so callers (AuthService.register)
   * can run this atomically with the User row it depends on — otherwise a
   * failure here (e.g. plans not seeded yet) leaves an orphaned User with no
   * tenant, permanently blocked from re-registering by the duplicate-email
   * check.
   */
  async createTenantWithOwner(
    ownerUserId: string,
    tenantName: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const plan = await tx.plan.findUniqueOrThrow({ where: { code: "free" } });
    const slug = await this.generateUniqueSlug(tenantName, tx);

    const tenant = await tx.tenant.create({
      data: {
        name: tenantName,
        slug,
        planId: plan.id,
        memberships: {
          create: { userId: ownerUserId, role: "owner" },
        },
      },
    });

    return tenant;
  }

  private async generateUniqueSlug(name: string, tx: Prisma.TransactionClient): Promise<string> {
    const base =
      name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "tenant";

    let candidate = base;
    let suffix = 1;
    while (await tx.tenant.findUnique({ where: { slug: candidate } })) {
      suffix += 1;
      candidate = `${base}-${suffix}`;
    }
    return candidate;
  }
}
