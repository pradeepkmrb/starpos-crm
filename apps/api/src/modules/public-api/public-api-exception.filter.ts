import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { Request, Response } from "express";
import { MetaApiError } from "../whatsapp/meta-graph.client";
import { reportError } from "../../common/error-reporter";
import "../../common/request-context";

/**
 * One error shape for every /api/v1 response, so an integration can branch on
 * `error.code` instead of pattern-matching prose:
 *
 *   { "error": { "code": "invalid_request", "message": "...", "status": 400 } }
 *
 * Nest's own validation and Http exceptions, and Meta's Graph API errors,
 * all get folded into it. Registered on the public controllers only — the
 * dashboard keeps Nest's default body, which apps/web already parses.
 */
@Catch()
export class PublicApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("PublicApi");

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const { status, code, message, extra } = describe(exception);

    if (status >= 500) {
      this.logger.error(
        `${req.method} ${req.originalUrl} -> ${status}: ${exception instanceof Error ? exception.stack : exception}`,
      );
      reportError(exception, {
        method: req.method,
        path: req.originalUrl,
        status,
        tenantId: req.tenantContext?.tenantId,
        apiKeyId: req.tenantContext?.apiKeyId,
      });
    }

    res.status(status).json({ error: { code, message, status, ...extra } });
  }
}

interface Described {
  status: number;
  code: string;
  message: string;
  extra?: Record<string, unknown>;
}

function describe(exception: unknown): Described {
  if (exception instanceof MetaApiError) {
    return {
      status: HttpStatus.BAD_GATEWAY,
      code: "whatsapp_error",
      message: exception.message,
      extra: { metaErrorCode: exception.code, metaErrorSubcode: exception.subcode },
    };
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const body = exception.getResponse();
    return { status, code: codeForStatus(status), message: flattenMessage(body, exception.message) };
  }

  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    code: "internal_error",
    message: "Something went wrong on our side. Try again, and contact support if it persists.",
  };
}

/**
 * ValidationPipe reports every failed constraint as an array. Joining them
 * keeps `message` a plain string on every response, whatever went wrong.
 */
function flattenMessage(body: unknown, fallback: string): string {
  if (typeof body === "string") return body;
  const message = (body as { message?: unknown })?.message;
  if (Array.isArray(message)) return message.join("; ");
  if (typeof message === "string") return message;
  return fallback;
}

function codeForStatus(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return "invalid_request";
    case HttpStatus.UNAUTHORIZED:
      return "unauthorized";
    case HttpStatus.FORBIDDEN:
      return "forbidden";
    case HttpStatus.NOT_FOUND:
      return "not_found";
    case HttpStatus.CONFLICT:
      return "conflict";
    case HttpStatus.TOO_MANY_REQUESTS:
      return "rate_limited";
    case HttpStatus.BAD_GATEWAY:
      return "whatsapp_error";
    default:
      return status >= 500 ? "internal_error" : "request_failed";
  }
}
