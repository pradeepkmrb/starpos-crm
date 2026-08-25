import { Global, Module } from "@nestjs/common";
import { EntitlementsService } from "./entitlements.service";

/** Global: nearly every write path needs a limit check. */
@Global()
@Module({
  providers: [EntitlementsService],
  exports: [EntitlementsService],
})
export class EntitlementsModule {}
