import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from "@nestjs/common";
import { Response } from "express";
import { EmailChannelError } from "./email.client";

/** An unreachable mailbox is the remote server's fault, not a server bug — say so, with its own words. */
@Catch(EmailChannelError)
export class EmailChannelExceptionFilter implements ExceptionFilter {
  catch(exception: EmailChannelError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    res.status(HttpStatus.BAD_GATEWAY).json({
      statusCode: HttpStatus.BAD_GATEWAY,
      error: "Bad Gateway",
      message: exception.message,
    });
  }
}
