import { Module } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { TenantsModule } from "../tenants/tenants.module";

@Module({
  imports: [TenantsModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
