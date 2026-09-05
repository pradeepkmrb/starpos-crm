import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

/** Palette keys the web app knows how to render; anything else is rejected. */
export const LABEL_COLORS = ["slate", "brand", "green", "amber", "red", "purple"] as const;
export type LabelColor = (typeof LABEL_COLORS)[number];

@Injectable()
export class LabelsService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.label.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
      include: { _count: { select: { contacts: true } } },
    });
  }

  create(tenantId: string, name: string, color: LabelColor) {
    return this.prisma.label.create({ data: { tenantId, name, color } });
  }

  async remove(tenantId: string, labelId: string) {
    const label = await this.prisma.label.findFirst({ where: { id: labelId, tenantId } });
    if (!label) throw new NotFoundException("Label not found");
    // ContactLabel rows cascade, so the contacts keep their other labels.
    await this.prisma.label.delete({ where: { id: labelId } });
    return { id: labelId, deleted: true };
  }

  /** Replaces a contact's labels wholesale — the UI edits them as a set. */
  async setContactLabels(tenantId: string, contactId: string, labelIds: string[]) {
    const contact = await this.prisma.contact.findFirst({ where: { id: contactId, tenantId } });
    if (!contact) throw new NotFoundException("Contact not found");

    // Scoped so a label id from another tenant can't be attached.
    const owned = await this.prisma.label.findMany({
      where: { tenantId, id: { in: labelIds } },
      select: { id: true },
    });

    await this.prisma.$transaction([
      this.prisma.contactLabel.deleteMany({ where: { contactId } }),
      this.prisma.contactLabel.createMany({
        data: owned.map((l) => ({ contactId, labelId: l.id })),
        skipDuplicates: true,
      }),
    ]);

    return this.prisma.label.findMany({ where: { id: { in: owned.map((l) => l.id) } } });
  }
}
