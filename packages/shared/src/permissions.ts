/**
 * Menu-level access control. A workspace defines its own roles; each role
 * gives every menu one of three levels, and a data scope that decides whose
 * records a person sees. The owner is always full access and is never
 * governed by a role.
 */

export type AccessLevel = "none" | "view" | "edit";

export const ACCESS_LEVELS: AccessLevel[] = ["none", "view", "edit"];

export const ACCESS_LEVEL_LABELS: Record<AccessLevel, string> = {
  none: "No access",
  view: "View",
  edit: "Edit",
};

/** Whose leads (and their activities, quotations, payments) a person sees. */
export type DataScope = "all" | "own";

export const DATA_SCOPE_LABELS: Record<DataScope, string> = {
  all: "All records",
  own: "Only their own and unassigned",
};

/** One entry per dashboard menu, in menu order. The key is stored in role permissions — never rename one. */
export const ACCESS_MODULES = [
  { key: "inbox", label: "Inbox", group: "Engage" },
  { key: "broadcasts", label: "Broadcasts", group: "Engage" },
  { key: "audience", label: "Audience", group: "Engage" },
  { key: "templates", label: "Message library", group: "Engage" },
  { key: "flows", label: "Flows", group: "Engage" },
  { key: "catalogue", label: "Catalogue", group: "Engage" },
  { key: "connections", label: "Connections", group: "Engage" },
  { key: "contact_fields", label: "Contact fields", group: "Engage" },
  { key: "leads", label: "Leads", group: "Sales CRM" },
  { key: "follow_ups", label: "Follow-ups", group: "Sales CRM" },
  { key: "visits", label: "Visits", group: "Sales CRM" },
  { key: "quotations", label: "Quotations", group: "Sales CRM" },
  { key: "payments", label: "Payments", group: "Sales CRM" },
  { key: "targets", label: "Targets", group: "Sales CRM" },
  { key: "lead_fields", label: "Lead fields", group: "Sales CRM" },
  { key: "analytics", label: "Analytics", group: "Insights" },
  { key: "team", label: "Team and roles", group: "Workspace" },
  { key: "integrations", label: "Integrations", group: "Workspace" },
  { key: "billing", label: "Plan and usage", group: "Workspace" },
  { key: "developers", label: "API and developers", group: "Workspace" },
] as const;

export type AccessModule = (typeof ACCESS_MODULES)[number]["key"];

export type Permissions = Record<AccessModule, AccessLevel>;

export const ACCESS_MODULE_KEYS: AccessModule[] = ACCESS_MODULES.map((m) => m.key);

function allAt(level: AccessLevel): Permissions {
  return Object.fromEntries(ACCESS_MODULE_KEYS.map((key) => [key, level])) as Permissions;
}

export const FULL_ACCESS: Permissions = allAt("edit");

/**
 * Parses stored or submitted permissions: unknown modules and levels are
 * dropped, and a menu that isn't mentioned gets no access — so a menu added
 * in a later release starts hidden until an admin grants it.
 */
export function normalizePermissions(input: unknown): Permissions {
  const result = allAt("none");
  if (input && typeof input === "object") {
    for (const key of ACCESS_MODULE_KEYS) {
      const level = (input as Record<string, unknown>)[key];
      if (level === "view" || level === "edit") result[key] = level;
    }
  }
  return result;
}

export function canView(permissions: Permissions, module: AccessModule): boolean {
  return permissions[module] !== "none";
}

export function canEdit(permissions: Permissions, module: AccessModule): boolean {
  return permissions[module] === "edit";
}

/** True when any of the modules reaches `level`. */
export function hasAccess(permissions: Permissions, modules: readonly AccessModule[], level: "view" | "edit"): boolean {
  return modules.some((m) => (level === "view" ? canView(permissions, m) : canEdit(permissions, m)));
}

export interface RoleTemplate {
  name: string;
  description: string;
  dataScope: DataScope;
  /** False = the mobile app only; the web dashboard refuses to sign them in. */
  webAccess: boolean;
  permissions: Permissions;
}

/** The starting roles every workspace gets. They are ordinary roles afterwards — editable and removable. */
export const DEFAULT_ROLE_TEMPLATES: RoleTemplate[] = [
  {
    name: "Admin",
    description: "Everything except billing checkout — manages the team and settings.",
    dataScope: "all",
    webAccess: true,
    permissions: FULL_ACCESS,
  },
  {
    name: "Sales agent",
    description: "Works their own leads in the field from the mobile app.",
    dataScope: "own",
    webAccess: false,
    permissions: {
      ...allAt("none"),
      inbox: "edit",
      audience: "view",
      templates: "view",
      catalogue: "view",
      leads: "edit",
      follow_ups: "edit",
      visits: "edit",
      quotations: "edit",
      payments: "edit",
      targets: "view",
    },
  },
  {
    name: "Viewer",
    description: "Read-only view of sales and messaging — changes nothing.",
    dataScope: "all",
    webAccess: true,
    permissions: {
      ...allAt("view"),
      connections: "none",
      team: "none",
      integrations: "none",
      billing: "none",
      developers: "none",
    },
  },
];
