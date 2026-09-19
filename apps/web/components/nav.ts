import {
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
  ShieldIcon,
  SlidersIcon,
  UsersIcon,
} from "./icons";

export interface NavItem {
  href: string;
  label: string;
  icon: typeof HomeIcon;
  /** Extra words the Ctrl+K search should match. */
  keywords?: string;
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
      { href: "/dashboard/inbox", label: "Inbox", icon: ChatIcon, keywords: "chat conversations reply" },
      { href: "/dashboard/campaigns", label: "Broadcasts", icon: MegaphoneIcon, keywords: "campaign bulk send" },
      { href: "/dashboard/contacts", label: "Audience", icon: UsersIcon, keywords: "contacts lists import csv" },
      { href: "/dashboard/templates", label: "Message library", icon: DocumentIcon, keywords: "templates" },
      { href: "/dashboard/automations", label: "Flows", icon: BoltIcon, keywords: "automations keyword welcome bot" },
      { href: "/dashboard/catalogue", label: "Catalogue", icon: BoxIcon, keywords: "products prices" },
      { href: "/dashboard/channels", label: "Connections", icon: PlugIcon, keywords: "whatsapp instagram messenger email channels" },
      { href: "/dashboard/contact-fields", label: "Contact fields", icon: SlidersIcon, keywords: "custom fields" },
    ],
  },
  {
    label: "Sales CRM",
    items: [
      { href: "/dashboard/leads", label: "Leads", icon: FunnelIcon, keywords: "pipeline deals kanban" },
      { href: "/dashboard/follow-ups", label: "Follow-ups", icon: CalendarIcon, keywords: "tasks today overdue" },
      { href: "/dashboard/visits", label: "Visits", icon: MapPinIcon, keywords: "field check-in team location" },
      { href: "/dashboard/lead-sources", label: "Meta ads", icon: MegaphoneIcon, keywords: "lead ads facebook forms" },
      { href: "/dashboard/lead-fields", label: "Lead fields", icon: SlidersIcon, keywords: "custom fields" },
    ],
  },
  {
    label: "Insights",
    items: [{ href: "/dashboard/analytics", label: "Analytics", icon: ChartIcon, keywords: "insights reports delivery" }],
  },
  {
    label: "Workspace",
    items: [
      { href: "/dashboard/team", label: "Team", icon: UsersIcon, keywords: "members invite roles workspace" },
      { href: "/dashboard/integrations", label: "Integrations", icon: PlugIcon },
      { href: "/dashboard/billing", label: "Plan and usage", icon: CreditCardIcon, keywords: "billing upgrade" },
      { href: "/dashboard/api", label: "API and developers", icon: CodeIcon, keywords: "keys webhooks docs" },
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
  { href: "/dashboard/leads?new=1", label: "New lead", icon: FunnelIcon, keywords: "add create" },
  { href: "/dashboard/campaigns", label: "New broadcast", icon: MegaphoneIcon, keywords: "send campaign" },
  { href: "/dashboard/contacts", label: "Import contacts", icon: UsersIcon, keywords: "csv upload" },
  { href: "/dashboard/automations", label: "New flow", icon: BoltIcon, keywords: "automation" },
];

/**
 * Fired when a quick action targets the page that is already open, where a
 * query-string change alone would not re-run the page's mount logic.
 */
export const NEW_LEAD_EVENT = "digitel:new-lead";

export function announceQuickAction(href: string) {
  if (href.startsWith("/dashboard/leads?new=1")) window.dispatchEvent(new Event(NEW_LEAD_EVENT));
}

export function isNavActive(pathname: string | null, href: string): boolean {
  const path = href.split("?")[0];
  return path === "/dashboard" ? pathname === path : !!pathname?.startsWith(path);
}
