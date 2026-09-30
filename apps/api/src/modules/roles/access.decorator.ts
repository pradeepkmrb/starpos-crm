import { SetMetadata } from "@nestjs/common";
import type { AccessModule } from "@starpos-crm/shared";

export const ACCESS_KEY = "menuAccess";

export interface AccessRule {
  /** Any of these at View (or better) lets a caller read. */
  view: readonly AccessModule[];
  /** Any of these at Edit lets a caller change things. */
  edit: readonly AccessModule[];
  /** Overrides the method-based default (GET/HEAD read, everything else changes). */
  level?: "view" | "edit";
}

/**
 * Which dashboard menus a route belongs to. Put it on a controller for the
 * common case and on a handler to override it:
 *
 *   @Access("leads")                                   — view to read, edit to change
 *   @Access({ view: ["leads", "quotations"], edit: ["leads"] })
 *   @Access("quotations", "edit")                      — needs edit even for a GET
 */
export function Access(modules: AccessModule | Partial<AccessRule>, level?: "view" | "edit") {
  const rule: AccessRule =
    typeof modules === "string"
      ? { view: [modules], edit: [modules], level }
      : {
          view: modules.view ?? modules.edit ?? [],
          edit: modules.edit ?? modules.view ?? [],
          level: modules.level ?? level,
        };
  return SetMetadata(ACCESS_KEY, rule);
}

/** For routes any signed-in member may use (their profile, photo uploads, push registration). */
export const AnyMember = () => SetMetadata(ACCESS_KEY, "any");
