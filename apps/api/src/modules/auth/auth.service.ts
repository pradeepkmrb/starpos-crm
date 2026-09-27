import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import type { TenantRole } from "@digitel/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { TenantsService } from "../tenants/tenants.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { AcceptInviteDto } from "./dto/accept-invite.dto";

interface TokenPayload {
  userId: string;
  tenantId: string;
  role: TenantRole;
}

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL = "7d";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantsService: TenantsService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const { user, tenant } = await this.createUserAndTenant(
      dto.email,
      dto.password,
      dto.name,
      dto.tenantName,
    );

    return {
      ...this.issueTokens({ userId: user.id, tenantId: tenant.id, role: "owner" }),
      user: { id: user.id, email: user.email, name: user.name },
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
      role: "owner" as TenantRole,
    };
  }

  /**
   * Platform-admin tenant provisioning (no self-registration involved) — the
   * admin types the owner's initial password directly and shares it with the
   * customer out of band, same as invite links today (no email provider is
   * wired up yet). Returns the created rows, not tokens: the admin isn't
   * logging in as the new owner.
   */
  async adminCreateTenant(dto: { tenantName: string; ownerName: string; ownerEmail: string; ownerPassword: string }) {
    const { user, tenant } = await this.createUserAndTenant(
      dto.ownerEmail,
      dto.ownerPassword,
      dto.ownerName,
      dto.tenantName,
    );
    return {
      user: { id: user.id, email: user.email, name: user.name },
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
    };
  }

  /**
   * Atomic: if tenant creation fails partway (e.g. plans not seeded yet), the
   * User row rolls back too instead of being stranded — a bare create() here
   * previously left orphaned Users that could never register again (blocked
   * by the email-conflict check below) and had no tenant to log into either.
   */
  private async createUserAndTenant(email: string, password: string, name: string, tenantName: string) {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException("An account with this email already exists");
    }

    const passwordHash = await bcrypt.hash(password, 10);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, passwordHash, name },
      });
      const tenant = await this.tenantsService.createTenantWithOwner(user.id, tenantName, tx);
      return { user, tenant };
    });
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const memberships = await this.prisma.tenantMembership.findMany({
      where: { userId: user.id, status: "active" },
      include: { tenant: true },
      orderBy: { createdAt: "asc" },
    });
    if (memberships.length === 0) {
      throw new UnauthorizedException("This account has no active tenant access");
    }

    const primary = memberships[0];
    return {
      ...this.issueTokens({ userId: user.id, tenantId: primary.tenantId, role: primary.role }),
      user: { id: user.id, email: user.email, name: user.name },
      tenant: { id: primary.tenant.id, name: primary.tenant.name, slug: primary.tenant.slug },
      role: primary.role,
      availableTenants: memberships.map((m) => ({
        id: m.tenant.id,
        name: m.tenant.name,
        role: m.role,
      })),
    };
  }

  async refresh(refreshToken: string) {
    const payload = this.verifyToken(refreshToken, process.env.JWT_REFRESH_SECRET);
    const membership = await this.prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId: payload.tenantId, userId: payload.userId } },
    });
    if (!membership || membership.status !== "active") {
      throw new UnauthorizedException("Tenant access revoked");
    }
    return this.issueTokens({
      userId: payload.userId,
      tenantId: payload.tenantId,
      role: membership.role,
    });
  }

  async switchTenant(userId: string, tenantId: string) {
    const membership = await this.prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      include: { tenant: true },
    });
    if (!membership || membership.status !== "active") {
      throw new ForbiddenException("You do not have access to that tenant");
    }
    return {
      ...this.issueTokens({ userId, tenantId, role: membership.role }),
      tenant: { id: membership.tenant.id, name: membership.tenant.name, slug: membership.tenant.slug },
      role: membership.role,
    };
  }

  async acceptInvite(dto: AcceptInviteDto) {
    const invite = await this.prisma.tenantInvite.findUnique({ where: { token: dto.token } });
    if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
      throw new UnauthorizedException("This invite is invalid or has expired");
    }

    let user = await this.prisma.user.findUnique({ where: { email: invite.email } });
    if (!user) {
      if (!dto.password || !dto.name) {
        throw new UnauthorizedException("Name and password are required to accept this invite");
      }
      const passwordHash = await bcrypt.hash(dto.password, 10);
      user = await this.prisma.user.create({
        data: { email: invite.email, passwordHash, name: dto.name },
      });
    }

    await this.prisma.$transaction([
      this.prisma.tenantMembership.upsert({
        where: { tenantId_userId: { tenantId: invite.tenantId, userId: user.id } },
        update: { status: "active", role: invite.role },
        create: { tenantId: invite.tenantId, userId: user.id, role: invite.role },
      }),
      this.prisma.tenantInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      }),
    ]);

    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: invite.tenantId } });
    return {
      ...this.issueTokens({ userId: user.id, tenantId: tenant.id, role: invite.role }),
      user: { id: user.id, email: user.email, name: user.name },
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
      role: invite.role,
    };
  }

  async me(userId: string, tenantId: string) {
    const [user, membership] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      this.prisma.tenantMembership.findUniqueOrThrow({
        where: { tenantId_userId: { tenantId, userId } },
        include: { tenant: true },
      }),
    ]);
    return {
      user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl },
      tenant: { id: membership.tenant.id, name: membership.tenant.name, slug: membership.tenant.slug },
      role: membership.role,
      isPlatformAdmin: user.isPlatformAdmin,
    };
  }

  async updateProfile(userId: string, dto: { name?: string; avatarUrl?: string | null }) {
    const data: { name?: string; avatarUrl?: string | null } = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.avatarUrl !== undefined) data.avatarUrl = dto.avatarUrl;
    await this.prisma.user.update({ where: { id: userId }, data });
  }

  private issueTokens(payload: TokenPayload) {
    const accessToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: ACCESS_TOKEN_TTL,
    });
    const refreshToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: REFRESH_TOKEN_TTL,
    });
    return { accessToken, refreshToken };
  }

  private verifyToken(token: string, secret: string | undefined): TokenPayload {
    try {
      return this.jwtService.verify<TokenPayload>(token, { secret });
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }
  }
}
