import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@starpos-crm/db";
import { DEFAULT_ROLE_TEMPLATES, normalizePermissions, type DataScope } from "@starpos-crm/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { MemberAccessService, roleForScope } from "./member-access.service";
import { SaveRoleDto } from "./dto/save-role.dto";

type RoleRow = Prisma.RoleGetPayload<{ include: { _count: { select: { memberships: true } } } }>;

function present(role: RoleRow) {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    permissions: normalizePermissions(role.permissions),
    dataScope: (role.dataScope === "own" ? "own" : "all") as DataScope,
    webAccess: role.webAccess,
    memberCount: role._count.memberships,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
  };
}

const WITH_COUNT = { _count: { select: { memberships: { where: { status: "active" as const } } } } };

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly memberAccess: MemberAccessService,
  ) {}

  async list(tenantId: string) {
    const roles = await this.prisma.role.findMany({ where: { tenantId }, include: WITH_COUNT, orderBy: { createdAt: "asc" } });
    return roles.map(present);
  }

  async create(tenantId: string, dto: SaveRoleDto) {
    try {
      const role = await this.prisma.role.create({
        data: {
          tenantId,
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          permissions: normalizePermissions(dto.permissions),
          dataScope: dto.dataScope,
          webAccess: dto.webAccess,
        },
        include: WITH_COUNT,
      });
      return present(role);
    } catch (err) {
      throw this.nameClash(err, dto.name);
    }
  }

  async update(tenantId: string, id: string, dto: SaveRoleDto) {
    await this.find(tenantId, id);
    try {
      const role = await this.prisma.$transaction(async (tx) => {
        const saved = await tx.role.update({
          where: { id },
          data: {
            name: dto.name.trim(),
            description: dto.description?.trim() || null,
            permissions: normalizePermissions(dto.permissions),
            dataScope: dto.dataScope,
            webAccess: dto.webAccess,
          },
          include: WITH_COUNT,
        });
        // Keep the legacy role column in step with the scope (see TenantMembership.role).
        await tx.tenantMembership.updateMany({
          where: { tenantId, roleId: id, role: { not: "owner" } },
          data: { role: roleForScope(dto.dataScope) },
        });
        return saved;
      });
      this.memberAccess.forget(tenantId);
      return present(role);
    } catch (err) {
      throw this.nameClash(err, dto.name);
    }
  }

  /** Refused while anyone still has the role, so nobody is left without access by accident. */
  async remove(tenantId: string, id: string) {
    await this.find(tenantId, id);
    const inUse = await this.prisma.tenantMembership.count({ where: { tenantId, roleId: id, status: "active" } });
    if (inUse > 0) {
      throw new BadRequestException(
        `${inUse} ${inUse === 1 ? "person has" : "people have"} this role — move them to another role first`,
      );
    }
    await this.prisma.$transaction([
      // Removed teammates may still point at it; they have no access anyway.
      this.prisma.tenantMembership.updateMany({ where: { tenantId, roleId: id }, data: { roleId: null } }),
      this.prisma.role.delete({ where: { id } }),
    ]);
    return { id, deleted: true };
  }

  /** A role id from a request, checked to belong to this workspace. */
  async find(tenantId: string, id: string) {
    const role = await this.prisma.role.findFirst({ where: { id, tenantId } });
    if (!role) throw new NotFoundException("Role not found");
    return role;
  }

  /** Every new workspace starts with Admin, Sales agent and Viewer. */
  async createDefaults(tenantId: string, tx: Prisma.TransactionClient = this.prisma) {
    for (const template of DEFAULT_ROLE_TEMPLATES) {
      await tx.role.upsert({
        where: { tenantId_name: { tenantId, name: template.name } },
        update: {},
        create: {
          tenantId,
          name: template.name,
          description: template.description,
          permissions: template.permissions,
          dataScope: template.dataScope,
          webAccess: template.webAccess,
        },
      });
    }
  }

  private nameClash(err: unknown, name: string) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return new ConflictException(`A role called "${name.trim()}" already exists`);
    }
    return err;
  }
}
