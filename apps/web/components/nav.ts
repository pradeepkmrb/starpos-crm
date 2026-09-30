import {
  BanknotesIcon,
  BoltIcon,
  BoxIcon,
  CalendarIcon,
  ChartIcon,
  ChatIcon,
  CodeIcon,
  CreditCardIcon,
  DocumentIcon,
  FunnelIcon,
  HomeIcon,
  MapPinIcon,
  MegaphoneIcon,
  PlugIcon,
  ReceiptIcon,
  ShieldIcon,
  SlidersIcon,
  TargetIcon,
  UsersIcon,
} from "./icons";
import { canEdit, canView, type AccessModule, type Permissions } from "@starpos-crm/shared";

export interface NavItem {
  href: string;
  label: string;
  icon: typeof HomeIcon;
  /** Extra words the Ctrl+K search should match. */
  keywords?: string;
  /** The role permission that shows this item; omitted for pages everyone gets (Home). */
  module?: AccessModule;
  /** Quick actions create things, so they need Edit on the module rather than View. */
  needsEdit?: boolean;
}

export interface NavGroup {
  label: string | null;
  items: NavItem[];
}

/** The dashboard's sections — the sidebar and the Ctrl+K search both read this. */
export const NAV_GROUPS: NavGroup[] = [
  { label: null, items: [{ href: "/dashboard", label: "Home", icon: HomeIcon, keywords: "dashboard overview" }] },
  {
    label: "Engage",
    items: [
      { href: "/dashboard/inbox", label: "Inbox", icon: ChatIcon, keywords: "chat conversations reply", module: "inbox" },
      { href: "/dashboard/campaigns", label: "Broadcasts", icon: MegaphoneIcon, keywords: "campaign bulk send", module: "broadcasts" },
      { href: "/dashboard/contacts", label: "Audience", icon: UsersIcon, keywords: "contacts lists import csv", module: "audience" },
      { href: "/dashboard/templates", label: "Message library", icon: DocumentIcon, keywords: "templates", module: "templates" },
      { href: "/dashboard/automations", label: "Flows", icon: BoltIcon, keywords: "automations keyword welcome bot", module: "flows" },
      { href: "/dashboard/catalogue", label: "Catalogue", icon: BoxIcon, keywords: "products prices", module: "catalogue" },
      {
        href: "/dashboard/channels",
        label: "Connections",
        icon: PlugIcon,
        keywords: "whatsapp instagram messenger email channels",
        module: "connections",
      },
      {
        href: "/dashboard/contact-fields",
        label: "Contact fields",
        icon: SlidersIcon,
        keywords: "custom fields",
        module: "contact_fields",
      },
    ],
  },
  {
    label: "Sales CRM",
    items: [
      { href: "/dashboard/leads", label: "Leads", icon: FunnelIcon, keywords: "pipeline deals kanban", module: "leads" },
      { href: "/dashboard/follow-ups", label: "Follow-ups", icon: CalendarIcon, keywords: "tasks today overdue", module: "follow_ups" },
      {
        href: "/dashboard/visits",
        label: "Visits",
        icon: MapPinIcon,
        keywords: "field check-in team location attendance clock",
        module: "visits",
      },
      {
        href: "/dashboard/quotations",
        label: "Quotations",
        icon: ReceiptIcon,
        keywords: "quote estimate proposal gst pdf",
        module: "quotations",
      },
      {
        href: "/dashboard/payments",
        label: "Payments",
        icon: BanknotesIcon,
        keywords: "collections received cash upi",
        module: "payments",
      },
      { href: "/dashboard/targets", label: "Targets", icon: TargetIcon, keywords: "goals quota leaderboard monthly", module: "targets" },
      { href: "/dashboard/lead-fields", label: "Lead fields", icon: SlidersIcon, keywords: "custom fields", module: "lead_fields" },
    ],
  },
  {
    label: "Insights",
    items: [
      { href: "/dashboard/analytics", label: "Analytics", icon: ChartIcon, keywords: "insights reports delivery", module: "analytics" },
    ],
  },
  {
    label: "Workspace",
    items: [
      {
        href: "/dashboard/team",
        label: "Team and roles",
        icon: UsersIcon,
        keywords: "members invite roles access permissions attendance",
        module: "team",
      },
      {
        href: "/dashboard/integrations",
        label: "Integrations",
        icon: PlugIcon,
        keywords: "meta lead ads facebook forms razorpay stripe",
        module: "integrations",
      },
      { href: "/dashboard/billing", label: "Plan and usage", icon: CreditCardIcon, keywords: "billing upgrade", module: "billing" },
      { href: "/dashboard/api", label: "API and developers", icon: CodeIcon, keywords: "keys webhooks docs", module: "developers" },
    ],
  },
];

export const AGENCY_NAV_ITEM: NavItem = {
  href: "/dashboard/platform-admin",
  label: "Agency console",
  icon: ShieldIcon,
  keywords: "platform admin meta app",
};

/** Things "+ New" and Ctrl+K can start directly. */
export const QUICK_ACTIONS: NavItem[] = [
  { href: "/dashboard/leads?new=1", label: "New lead", icon: FunnelIcon, keywords: "add create", module: "leads", needsEdit: true },
  {
    href: "/dashboard/quotations?new=1",
    label: "New quotation",
    icon: ReceiptIcon,
    keywords: "quote estimate",
    module: "quotations",
    needsEdit: true,
  },
  {
    href: "/dashboard/payments?new=1",
    label: "Record payment",
    icon: BanknotesIcon,
    keywords: "collection received",
    module: "payments",
    needsEdit: true,
  },
  {
    href: "/dashboard/campaigns",
    label: "New broadcast",
    icon: MegaphoneIcon,
    keywords: "send campaign",
    module: "broadcasts",
    needsEdit: true,
  },
  { href: "/dashboard/contacts", label: "Import contacts", icon: UsersIcon, keywords: "csv upload", module: "audience", needsEdit: true },
  { href: "/dashboard/automations", label: "New flow", icon: BoltIcon, keywords: "automation", module: "flows", needsEdit: true },
];

/** Whether a role's permissions show this item (no permissions yet = still loading = hide). */
export function navItemAllowed(item: NavItem, permissions: Permissions | null): boolean {
  if (!item.module) return true;
  if (!permissions) return false;
  return item.needsEdit ? canEdit(permissions, item.module) : canView(permissions, item.module);
}

/** The menu groups with the items this role can't open taken out, and empty groups dropped. */
export function visibleNavGroups(groups: NavGroup[], permissions: Permissions | null): NavGroup[] {
  return groups
    .map((g) => ({ ...g, items: g.items.filter((item) => navItemAllowed(item, permissions)) }))
    .filter((g) => g.items.length > 0);
}

/** The menu item a dashboard path belongs to, so a page opened by link can be checked too. */
export function navItemForPath(pathname: string | null): NavItem | undefined {
  return NAV_GROUPS.flatMap((g) => g.items)
    .filter((i) => i.href !== "/dashboard" && isNavActive(pathname, i.href))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

/**
 * Fired when a quick action targets the page that is already open, where a
 * query-string change alone would not re-run the page's mount logic.
 */
export const NEW_LEAD_EVENT = "starpos-crm:new-lead";
export const NEW_QUOTATION_EVENT = "starpos-crm:new-quotation";
export const NEW_PAYMENT_EVENT = "starpos-crm:new-payment";

const QUICK_ACTION_EVENTS: Record<string, string> = {
  "/dashboard/leads?new=1": NEW_LEAD_EVENT,
  "/dashboard/quotations?new=1": NEW_QUOTATION_EVENT,
  "/dashboard/payments?new=1": NEW_PAYMENT_EVENT,
};

export function announceQuickAction(href: string) {
  const event = QUICK_ACTION_EVENTS[href];
  if (event) window.dispatchEvent(new Event(event));
}

/** True when the page was opened by a "?new=1" quick action; clears the flag from the address bar. */
export function consumeNewFlag(): boolean {
  if (new URLSearchParams(window.location.search).get("new") !== "1") return false;
  window.history.replaceState(null, "", window.location.pathname);
  return true;
}

export function isNavActive(pathname: string | null, href: string): boolean {
  const path = href.split("?")[0];
  return path === "/dashboard" ? pathname === path : !!pathname?.startsWith(path);
}
