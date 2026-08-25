import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { Request, Response } from "express";
import { reportError } from "./error-reporter";
import "./request-context";

/**
 * Global safety net: logs every unhandled exception with request context
 * and reports it to Sentry if configured (no-op otherwise). More specific
 * filters registered on individual controllers (e.g. MetaApiExceptionFilter)
 * run first for the exceptions they declare — Nest resolves controller-scoped
 * filters before global ones — so this only ever sees what those didn't
 * already handle.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("UnhandledException");

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const responseBody = isHttpException
      ? exception.getResponse()
      : { statusCode: status, error: "Internal Server Error", message: "Something went wrong" };

    const logContext = {
      method: req.method,
      path: req.originalUrl,
      status,
      tenantId: req.tenantContext?.tenantId,
      userId: req.tenantContext?.userId,
    };

    if (status >= 500) {
      this.logger.error(
        `${req.method} ${req.originalUrl} -> ${status}: ${exception instanceof Error ? exception.stack : exception}`,
        JSON.stringify(logContext),
      );
      reportError(exception, logContext);
    } else {
      this.logger.warn(`${req.method} ${req.originalUrl} -> ${status}`, JSON.stringify(logContext));
    }

    res.status(status).json(responseBody);
  }
}
