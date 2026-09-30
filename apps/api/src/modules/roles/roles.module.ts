import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { RolesController } from "./roles.controller";
import { RolesService } from "./roles.service";
import { MemberAccessService } from "./member-access.service";
import { AccessGuard } from "./access.guard";

/**
 * Workspace roles and menu access. Global because the tenant middleware,
 * team management and tenant creation all need it, and the AccessGuard is
 * registered for every route.
 */
@Global()
@Module({
  controllers: [RolesController],
  providers: [RolesService, MemberAccessService, { provide: APP_GUARD, useClass: AccessGuard }],
  exports: [RolesService, MemberAccessService],
})
export class RolesModule {}
