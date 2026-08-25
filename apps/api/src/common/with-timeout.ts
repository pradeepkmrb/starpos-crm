import { ServiceUnavailableException } from "@nestjs/common";

/** Bounds a promise that could otherwise hang forever (e.g. BullMQ ops when Redis is unreachable). */
export function withTimeout<T>(promise: Promise<T>, ms: number, message = "Service unavailable"): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new ServiceUnavailableException(message)), ms),
    ),
  ]);
}
