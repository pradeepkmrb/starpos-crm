import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { Request, Response } from "express";
import "../../common/request-context";

export const RATE_LIMIT_WINDOW_MS = 60_000;

/** Overridable so a self-hosted deployment can loosen or tighten it. */
export const RATE_LIMIT_PER_MINUTE = Number(process.env.PUBLIC_API_RATE_LIMIT_PER_MINUTE ?? 120);

interface Window {
  count: number;
  resetAt: number;
}

/**
 * Per-key request ceiling, to keep one workspace's integration from
 * saturating the API. Counters live in this process, so with several API
 * replicas the effective ceiling is per replica — enough to stop a runaway
 * loop, and not what enforces the plan's monthly quota. That remains
 * EntitlementsService, metered on the outbound Meta calls a request makes.
 */
@Injectable()
export class ApiRateLimitGuard implements CanActivate {
  private readonly windows = new Map<string, Window>();
  private lastSweep = Date.now();

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    const key = req.tenantContext?.apiKeyId;
    // Unauthenticated requests are ApiKeyGuard's to reject.
    if (!key) return true;

    const now = Date.now();
    this.sweep(now);

    const existing = this.windows.get(key);
    const window =
      existing && existing.resetAt > now ? existing : { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    window.count += 1;
    this.windows.set(key, window);

    const remaining = Math.max(0, RATE_LIMIT_PER_MINUTE - window.count);
    res.setHeader("X-RateLimit-Limit", RATE_LIMIT_PER_MINUTE);
    res.setHeader("X-RateLimit-Remaining", remaining);
    res.setHeader("X-RateLimit-Reset", Math.ceil(window.resetAt / 1000));

    if (window.count > RATE_LIMIT_PER_MINUTE) {
      const retryAfter = Math.max(1, Math.ceil((window.resetAt - now) / 1000));
      res.setHeader("Retry-After", retryAfter);
      throw new HttpException(
        `Rate limit of ${RATE_LIMIT_PER_MINUTE} requests per minute exceeded. Retry in ${retryAfter}s.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  /** Drops expired windows so the map tracks only currently active keys. */
  private sweep(now: number) {
    if (now - this.lastSweep < RATE_LIMIT_WINDOW_MS) return;
    this.lastSweep = now;
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key);
    }
  }
}
