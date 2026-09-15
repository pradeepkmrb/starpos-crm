import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@digitel/db";
import {
  INTEGRATIONS,
  findIntegration,
  type IntegrationSpec,
  type IntegrationStatus,
} from "@digitel/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { decryptToken, encryptToken } from "../../common/token-encryption";
import { PaymentGatewayClient } from "./payment-gateway.client";
import {
  buildPublicView,
  detectMode,
  normalizeCredentials,
  type CredentialMap,
} from "./integration-credentials";

/** One catalog entry plus this tenant's connection, if any. */
export interface IntegrationView {
  provider: string;
  name: string;
  category: string;
  description: string;
  initials: string;
  docsUrl: string;
  fields: IntegrationSpec["fields"];
  connection: {
    status: IntegrationStatus;
    mode: string | null;
    accountLabel: string | null;
    /** Non-secret fields as entered; secrets as a masked tail. */
    values: Record<string, string>;
    connectedBy: { id: string; name: string | null; email: string } | null;
    connectedAt: Date;
    lastCheckedAt: Date | null;
    lastError: string | null;
  } | null;
}

const CONNECTED_BY = { select: { id: true, name: true, email: true } };

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateways: PaymentGatewayClient,
  ) {}

  /** The whole catalog, each entry carrying this tenant's connection state. */
  async list(tenantId: string): Promise<IntegrationView[]> {
    const rows = await this.prisma.tenantIntegration.findMany({
      where: { tenantId },
      include: { connectedBy: CONNECTED_BY },
    });
    const byProvider = new Map(rows.map((row) => [row.provider, row]));
    return INTEGRATIONS.map((spec) => toView(spec, byProvider.get(spec.provider) ?? null));
  }

  async get(tenantId: string, provider: string): Promise<IntegrationView> {
    const spec = requireSpec(provider);
    const row = await this.prisma.tenantIntegration.findFirst({
      where: { tenantId, provider },
      include: { connectedBy: CONNECTED_BY },
    });
    return toView(spec, row);
  }

  /**
   * Connects the provider, or replaces the credentials of one already
   * connected. The keys are checked against the provider first: storing keys
   * that do not work only moves the failure to a customer's payment.
   */
  async connect(
    tenantId: string,
    provider: string,
    submitted: Record<string, unknown>,
    userId: string,
  ): Promise<IntegrationView> {
    const spec = requireSpec(provider);
    const existing = await this.prisma.tenantIntegration.findFirst({ where: { tenantId, provider } });
    const existingCredentials = existing ? readCredentials(existing.credentialsEncrypted) : null;

    const credentials = normalizeCredentials(spec, submitted, existingCredentials);
    const { accountLabel } = await this.gateways.verify(provider, credentials);

    const data = {
      category: spec.category,
      status: "connected" as const,
      credentialsEncrypted: encryptToken(JSON.stringify(credentials)),
      publicJson: buildPublicView(spec, credentials),
      mode: detectMode(spec, credentials),
      accountLabel,
      lastCheckedAt: new Date(),
      lastError: null,
      connectedByUserId: userId,
    };

    const row = existing
      ? await this.prisma.tenantIntegration.update({
          where: { id: existing.id },
          data,
          include: { connectedBy: CONNECTED_BY },
        })
      : await this.prisma.tenantIntegration.create({
          data: { tenantId, provider, ...data },
          include: { connectedBy: CONNECTED_BY },
        });

    return toView(spec, row);
  }

  /**
   * Re-checks stored credentials against the provider. A failure is recorded
   * rather than thrown, so the screen can show why a gateway stopped working
   * (revoked key, account on hold) instead of just failing the request.
   */
  async test(tenantId: string, provider: string): Promise<IntegrationView> {
    const spec = requireSpec(provider);
    const row = await this.requireRow(tenantId, provider);
    const credentials = readCredentials(row.credentialsEncrypted);

    try {
      const { accountLabel } = await this.gateways.verify(provider, credentials);
      const updated = await this.prisma.tenantIntegration.update({
        where: { id: row.id },
        data: {
          accountLabel,
          lastCheckedAt: new Date(),
          lastError: null,
          // A working key clears an earlier error, but never un-pauses a
          // gateway the operator deliberately disabled.
          status: row.status === "error" ? "connected" : row.status,
        },
        include: { connectedBy: CONNECTED_BY },
      });
      return toView(spec, updated);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const updated = await this.prisma.tenantIntegration.update({
        where: { id: row.id },
        data: { status: "error", lastCheckedAt: new Date(), lastError: message },
        include: { connectedBy: CONNECTED_BY },
      });
      return toView(spec, updated);
    }
  }

  /** Pauses or resumes a connection without discarding its credentials. */
  async setActive(tenantId: string, provider: string, isActive: boolean): Promise<IntegrationView> {
    const spec = requireSpec(provider);
    const row = await this.requireRow(tenantId, provider);
    const updated = await this.prisma.tenantIntegration.update({
      where: { id: row.id },
      data: { status: isActive ? "connected" : "disabled" },
      include: { connectedBy: CONNECTED_BY },
    });
    return toView(spec, updated);
  }

  /** Disconnects and erases the stored credentials. */
  async disconnect(tenantId: string, provider: string) {
    const row = await this.requireRow(tenantId, provider);
    await this.prisma.tenantIntegration.delete({ where: { id: row.id } });
    return { provider, disconnected: true };
  }

  /**
   * The decrypted credentials for a tenant's connected provider — the one way
   * anything else in the app should reach a tenant's own gateway, so every
   * caller is scoped to a tenant by construction. Returns null when the
   * tenant has not connected that provider, or has it paused.
   */
  async getCredentials(tenantId: string, provider: string): Promise<CredentialMap | null> {
    const row = await this.prisma.tenantIntegration.findFirst({
      where: { tenantId, provider, status: "connected" },
    });
    return row ? readCredentials(row.credentialsEncrypted) : null;
  }

  /** The tenant's active payment gateway, when exactly one is expected. */
  async getActivePaymentGateway(
    tenantId: string,
  ): Promise<{ provider: string; mode: string | null; credentials: CredentialMap } | null> {
    const row = await this.prisma.tenantIntegration.findFirst({
      where: { tenantId, category: "payments", status: "connected" },
      orderBy: { updatedAt: "desc" },
    });
    if (!row) return null;
    return { provider: row.provider, mode: row.mode, credentials: readCredentials(row.credentialsEncrypted) };
  }

  private async requireRow(tenantId: string, provider: string) {
    const row = await this.prisma.tenantIntegration.findFirst({
      where: { tenantId, provider },
      include: { connectedBy: CONNECTED_BY },
    });
    if (!row) throw new NotFoundException(`${provider} is not connected`);
    return row;
  }
}

function requireSpec(provider: string): IntegrationSpec {
  const spec = findIntegration(provider);
  if (!spec) throw new BadRequestException(`Unknown integration "${provider}"`);
  return spec;
}

function readCredentials(encrypted: string): CredentialMap {
  const parsed: unknown = JSON.parse(decryptToken(encrypted));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  return Object.fromEntries(
    Object.entries(parsed as Record<string, unknown>).filter(([, v]) => typeof v === "string"),
  ) as CredentialMap;
}

interface IntegrationRow {
  status: string;
  mode: string | null;
  accountLabel: string | null;
  publicJson: Prisma.JsonValue;
  connectedBy: { id: string; name: string | null; email: string } | null;
  createdAt: Date;
  lastCheckedAt: Date | null;
  lastError: string | null;
}

/** Shapes a catalog entry and its row into what the dashboard renders. Never includes a secret. */
function toView(spec: IntegrationSpec, row: IntegrationRow | null): IntegrationView {
  return {
    provider: spec.provider,
    name: spec.name,
    category: spec.category,
    description: spec.description,
    initials: spec.initials,
    docsUrl: spec.docsUrl,
    fields: spec.fields,
    connection: row
      ? {
          status: row.status as IntegrationStatus,
          mode: row.mode,
          accountLabel: row.accountLabel,
          values:
            row.publicJson !== null && typeof row.publicJson === "object" && !Array.isArray(row.publicJson)
              ? (row.publicJson as Record<string, string>)
              : {},
          connectedBy: row.connectedBy,
          connectedAt: row.createdAt,
          lastCheckedAt: row.lastCheckedAt,
          lastError: row.lastError,
        }
      : null,
  };
}
