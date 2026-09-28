import { ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma } from "@starpos-crm/db";
import { PrismaService } from "../../prisma/prisma.service";
import { encryptToken } from "../../common/token-encryption";
import { LinkMetaFormDto } from "./dto/link-meta-form.dto";
import { UpdateMetaFormDto } from "./dto/update-meta-form.dto";
import { MetaLeadsClient, type MetaFormQuestion } from "./meta-leads.client";
import { MetaLeadsService } from "./meta-leads.service";

/** A linked form as the dashboard sees it — the stored token never leaves the API. */
export interface PublicMetaLeadForm {
  id: string;
  pageId: string;
  pageName: string | null;
  formId: string;
  formName: string | null;
  isActive: boolean;
  /** Set when the form came from "Connect with Meta" rather than a hand-entered token. */
  connectionId: string | null;
  /** The form's questions as last read from Meta — may be empty for hand-linked forms. */
  questions: MetaFormQuestion[];
  fieldMapping: Record<string, string>;
  defaultStatus: string;
  leadCount: number;
  lastLeadAt: Date | null;
  lastSyncAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class MetaLeadFormsService {
  private readonly logger = new Logger(MetaLeadFormsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: MetaLeadsClient,
    private readonly metaLeads: MetaLeadsService,
  ) {}

  async list(tenantId: string): Promise<PublicMetaLeadForm[]> {
    const links = await this.prisma.metaLeadForm.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    });
    return links.map(toPublic);
  }

  /**
   * Links a form. The token is checked against Meta so a typo surfaces
   * immediately, but a failed check does not block the link — the operator
   * may be wiring this up before the token has its permissions — so the
   * warning is returned instead.
   */
  async link(tenantId: string, dto: LinkMetaFormDto) {
    const existing = await this.prisma.metaLeadForm.findFirst({
      where: { tenantId, formId: dto.formId },
      select: { id: true },
    });
    if (existing) throw new ConflictException("That form is already linked");

    const encrypted = encryptToken(dto.pageAccessToken);
    const probe = await this.probeForm(tenantId, encrypted, dto.formId);

    const link = await this.prisma.metaLeadForm.create({
      data: {
        tenantId,
        pageId: dto.pageId.trim(),
        pageName: dto.pageName?.trim() || probe.details?.pageName || null,
        formId: dto.formId.trim(),
        formName: dto.formName?.trim() || probe.details?.name || null,
        pageAccessTokenEncrypted: encrypted,
        isActive: dto.isActive ?? true,
        defaultStatus: dto.defaultStatus ?? "new",
        fieldMappingJson: dto.fieldMapping ?? Prisma.DbNull,
        questionsJson: probe.questions.length > 0 ? (probe.questions as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
      },
    });

    return { form: toPublic(link), questions: probe.questions, warning: probe.warning };
  }

  async update(tenantId: string, id: string, dto: UpdateMetaFormDto): Promise<PublicMetaLeadForm> {
    const link = await this.prisma.metaLeadForm.findFirst({ where: { id, tenantId } });
    if (!link) throw new NotFoundException("Linked form not found");

    const data: Prisma.MetaLeadFormUpdateInput = {};
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.defaultStatus !== undefined) data.defaultStatus = dto.defaultStatus;
    if (dto.fieldMapping !== undefined) data.fieldMappingJson = dto.fieldMapping;
    if (dto.formName !== undefined) data.formName = dto.formName.trim() || null;
    if (dto.pageName !== undefined) data.pageName = dto.pageName.trim() || null;
    if (dto.pageAccessToken !== undefined) {
      data.pageAccessTokenEncrypted = encryptToken(dto.pageAccessToken);
    }

    const updated = await this.prisma.metaLeadForm.update({ where: { id }, data });
    return toPublic(updated);
  }

  /**
   * Unlinks the form. Leads already captured stay — their metaFormLinkId is
   * set to null by the schema rather than cascading the leads away.
   */
  async remove(tenantId: string, id: string) {
    const link = await this.prisma.metaLeadForm.findFirst({ where: { id, tenantId } });
    if (!link) throw new NotFoundException("Linked form not found");
    await this.prisma.metaLeadForm.delete({ where: { id } });
    return { id, deleted: true };
  }

  /** The form's questions, so the mapping editor lists what Meta actually asks. */
  async questions(tenantId: string, id: string) {
    const link = await this.prisma.metaLeadForm.findFirst({ where: { id, tenantId } });
    if (!link) throw new NotFoundException("Linked form not found");

    const probe = await this.probeForm(tenantId, link.pageAccessTokenEncrypted, link.formId);
    if (probe.questions.length > 0) {
      await this.prisma.metaLeadForm.update({
        where: { id },
        data: { questionsJson: probe.questions as unknown as Prisma.InputJsonValue },
      });
      return { questions: probe.questions };
    }
    // Meta could not be reached: the last known questions beat an empty editor.
    return { questions: readQuestions(link.questionsJson), warning: probe.warning };
  }

  async sync(tenantId: string, id: string, limit?: number) {
    const link = await this.prisma.metaLeadForm.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!link) throw new NotFoundException("Linked form not found");

    const outcome = await this.metaLeads.syncForm(tenantId, id, limit ?? 50);
    const refreshed = await this.prisma.metaLeadForm.findFirstOrThrow({ where: { id, tenantId } });
    return { ...outcome, form: toPublic(refreshed) };
  }

  private async probeForm(
    tenantId: string,
    encryptedToken: string,
    formId: string,
  ): Promise<{ details?: { name?: string; pageName?: string }; questions: MetaFormQuestion[]; warning?: string }> {
    try {
      const details = await this.client.fetchFormDetails(tenantId, encryptedToken, formId);
      return { details, questions: details.questions };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Could not read Meta form ${formId}: ${message}`);
      return { questions: [], warning: `Meta could not read this form yet: ${message}` };
    }
  }
}

function toPublic(link: {
  id: string;
  pageId: string;
  pageName: string | null;
  formId: string;
  formName: string | null;
  isActive: boolean;
  connectionId: string | null;
  questionsJson: Prisma.JsonValue;
  fieldMappingJson: Prisma.JsonValue;
  defaultStatus: string;
  leadCount: number;
  lastLeadAt: Date | null;
  lastSyncAt: Date | null;
  createdAt: Date;
}): PublicMetaLeadForm {
  const mapping =
    link.fieldMappingJson !== null &&
    typeof link.fieldMappingJson === "object" &&
    !Array.isArray(link.fieldMappingJson)
      ? (link.fieldMappingJson as Record<string, string>)
      : {};

  return {
    id: link.id,
    pageId: link.pageId,
    pageName: link.pageName,
    formId: link.formId,
    formName: link.formName,
    isActive: link.isActive,
    connectionId: link.connectionId,
    questions: readQuestions(link.questionsJson),
    fieldMapping: mapping,
    defaultStatus: link.defaultStatus,
    leadCount: link.leadCount,
    lastLeadAt: link.lastLeadAt,
    lastSyncAt: link.lastSyncAt,
    createdAt: link.createdAt,
  };
}

function readQuestions(value: Prisma.JsonValue): MetaFormQuestion[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is { key: string; label: string } =>
      item !== null && typeof item === "object" && !Array.isArray(item) && typeof item.key === "string",
  ) as MetaFormQuestion[];
}
