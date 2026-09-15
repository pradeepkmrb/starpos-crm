import { Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { decryptToken, encryptToken } from "../../common/token-encryption";

/** 32 random bytes rendered as 64 hex characters. */
const KEY_BYTES = 32;
const PREFIX_LENGTH = 8;

/**
 * lastUsedAt is a convenience for the operator, not an audit log, so it is
 * written at most once a minute per key rather than on every request.
 */
const LAST_USED_WRITE_INTERVAL_MS = 60_000;

export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export interface ApiKeyView {
  id: string;
  name: string;
  prefix: string;
  /** The raw key. Only ever returned to an authenticated admin of the owning workspace. */
  key: string;
  lastUsedAt: Date | null;
  createdAt: Date;
}

export interface ApiKeyPrincipal {
  apiKeyId: string;
  tenantId: string;
}

/**
 * Issues and verifies the credentials behind the public REST API (/api/v1).
 *
 * Keys are stored twice: as a SHA-256 hash, which is the unique lookup
 * column used to authenticate a request in one indexed point read, and as
 * AES-GCM ciphertext, so the API & Developers page can reveal the key the
 * operator already owns instead of forcing a rotation every time they lose
 * their copy. Everything an attacker could reach without both the database
 * and TOKEN_ENCRYPTION_KEY is still opaque.
 */
@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  /** The workspace's current key, minting one on first look. */
  async getOrCreateActiveKey(tenantId: string): Promise<ApiKeyView> {
    const existing = await this.prisma.apiKey.findFirst({
      where: { tenantId, revokedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (existing) return toView(existing);
    return this.issue(tenantId);
  }

  /**
   * Revokes every live key and mints a replacement. Revoking first means a
   * leaked key stops working the moment the operator clicks Regenerate, even
   * if the create below were to fail.
   */
  async regenerate(tenantId: string, name?: string): Promise<ApiKeyView> {
    await this.revokeAll(tenantId);
    return this.issue(tenantId, name);
  }

  async revokeAll(tenantId: string): Promise<{ revoked: number }> {
    const { count } = await this.prisma.apiKey.updateMany({
      where: { tenantId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { revoked: count };
  }

  /**
   * Resolves a raw `X-API-Key` header to its workspace, or null when the key
   * is unknown, revoked, or belongs to a suspended workspace. Runs before any
   * tenant context exists, so every query here is explicitly unscoped.
   */
  async authenticate(rawKey: string): Promise<ApiKeyPrincipal | null> {
    const trimmed = rawKey.trim();
    if (!trimmed) return null;

    const record = await this.prisma.apiKey.findUnique({
      where: { keyHash: hashApiKey(trimmed) },
      include: { tenant: { select: { status: true } } },
    });
    if (!record || record.revokedAt || record.tenant.status !== "active") return null;

    await this.touch(record.id, record.lastUsedAt);
    return { apiKeyId: record.id, tenantId: record.tenantId };
  }

  private async issue(tenantId: string, name?: string): Promise<ApiKeyView> {
    const raw = randomBytes(KEY_BYTES).toString("hex");
    const created = await this.prisma.apiKey.create({
      data: {
        tenantId,
        name: name?.trim() || "Default key",
        keyHash: hashApiKey(raw),
        keyEncrypted: encryptToken(raw),
        prefix: raw.slice(0, PREFIX_LENGTH),
      },
    });
    // Returned from the in-memory value rather than a decrypt round trip.
    return { ...toView(created), key: raw };
  }

  private async touch(apiKeyId: string, lastUsedAt: Date | null): Promise<void> {
    if (lastUsedAt && Date.now() - lastUsedAt.getTime() < LAST_USED_WRITE_INTERVAL_MS) return;
    // A failed bookkeeping write must never fail the caller's request.
    await this.prisma.apiKey
      .update({ where: { id: apiKeyId }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
  }
}

function toView(row: {
  id: string;
  name: string;
  prefix: string;
  keyEncrypted: string;
  lastUsedAt: Date | null;
  createdAt: Date;
}): ApiKeyView {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    key: decryptToken(row.keyEncrypted),
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
  };
}
