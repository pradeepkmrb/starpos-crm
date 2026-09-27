import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/all-exceptions.filter";
import { initErrorReporting } from "./common/error-reporter";

async function bootstrap() {
  initErrorReporting();

  // rawBody is needed to verify Meta's X-Hub-Signature-256 webhook header.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  // Photos arrive as base64 JSON (see MediaModule); the 100 KB default is too small.
  app.useBodyParser("json", { limit: "4mb" });
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  // Railway (and most PaaS hosts) inject PORT with the port the app must
  // bind to; API_PORT remains the local-dev override.
  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${port}`);
}

bootstrap();
