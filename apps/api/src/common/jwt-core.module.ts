import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

/**
 * Registers a secret-less JwtService globally. Access and refresh tokens use
 * different secrets (JWT_ACCESS_SECRET / JWT_REFRESH_SECRET), passed
 * explicitly on each sign()/verify() call rather than via module defaults.
 */
@Global()
@Module({
  imports: [JwtModule.register({})],
  exports: [JwtModule],
})
export class JwtCoreModule {}
