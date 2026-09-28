import { Controller, Get, HttpStatus, Res } from "@nestjs/common";
import { Response } from "express";
import { PrismaService } from "../../prisma/prisma.service";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(@Res() res: Response) {
    const database = await this.checkDatabase();
    const status = database.ok ? "ok" : "degraded";

    res
      .status(database.ok ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE)
      .json({ status, service: "starpos-crm-api", time: new Date().toISOString(), database });
  }

  private async checkDatabase(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "unknown error" };
    }
  }
}
