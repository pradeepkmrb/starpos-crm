import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

/**
 * Worker entrypoint: boots the same Nest module tree as the HTTP API but
 * without listening for HTTP traffic. Deployed as a separate container so
 * BullMQ queue processors (added from Phase 2 onward) scale independently
 * of the API. No processors are registered yet in Phase 0.
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  // eslint-disable-next-line no-console
  console.log("Worker context started (no queue processors registered yet).");
  process.on("SIGTERM", async () => {
    await app.close();
    process.exit(0);
  });
}

bootstrap();
