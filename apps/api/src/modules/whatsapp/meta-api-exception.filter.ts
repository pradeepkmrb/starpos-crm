import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from "@nestjs/common";
import { Response } from "express";
import { MetaApiError } from "./meta-graph.client";

/** Surfaces Meta's actual error message instead of an opaque 500. */
@Catch(MetaApiError)
export class MetaApiExceptionFilter implements ExceptionFilter {
  catch(exception: MetaApiError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    res.status(HttpStatus.BAD_GATEWAY).json({
      statusCode: HttpStatus.BAD_GATEWAY,
      error: "Bad Gateway",
      message: `Meta API error: ${exception.message}`,
      metaErrorCode: exception.code,
    });
  }
}
