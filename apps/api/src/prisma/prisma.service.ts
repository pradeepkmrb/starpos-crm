import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@digitel/db";
import { tenantScopingMiddleware } from "./tenant-scoping.middleware";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    this.$use(tenantScopingMiddleware());
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
