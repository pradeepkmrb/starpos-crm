import type {
  ActivityStatus,
  ActivityType,
  ChannelType,
  CustomFieldEntity,
  CustomFieldType,
  IntegrationFieldSpec,
  IntegrationStatus,
  LeadStatus,
  PaymentMode,
  PlanCode,
  QuotationStatus,
  TenantRole,
} from "@digitel/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Origin the public REST API is served from — the docs page quotes it in every example. */
export const API_BASE_URL = API_URL;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// Access tokens last 15 minutes. On a 401 the refresh token buys a new pair
// and the request is retried once, so people aren't bounced to the login
// page mid-task. Concurrent 401s share a single refresh call.
let refreshing: Promise<boolean> | null = null;

/** Sign-in calls, where a 401 means wrong credentials rather than an expired session. */
const NO_REFRESH_PATHS = new Set(["/auth/login", "/auth/register", "/auth/refresh", "/auth/accept-invite"]);

async function refreshTokens(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;
      storeTokens(await res.json());
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

async function request<T>(path: string, options: RequestInit = {}, retried = false): Promise<T> {
  const token = getAccessToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (res.status === 401 && !retried && !NO_REFRESH_PATHS.has(path) && (await refreshTokens())) {
    return request<T>(path, options, true);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, body.message ?? `Request failed (${res.status})`);
  }
  return body as T;
}

// --- token storage (client-side only; simplification documented in the
// Phase 1 plan — moving to an httpOnly cookie behind a same-origin proxy is
// a Phase 6 hardening item) ---

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("digitel_access_token");
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("digitel_refresh_token");
}

function storeTokens(tokens: { accessToken: string; refreshToken: string }) {
  localStorage.setItem("digitel_access_token", tokens.accessToken);
  localStorage.setItem("digitel_refresh_token", tokens.refreshToken);
}

export function clearTokens() {
  localStorage.removeItem("digitel_access_token");
  localStorage.removeItem("digitel_refresh_token");
}

// --- types ---

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
}

export interface AuthTenant {
  id: string;
  name: string;
  slug: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
  tenant: AuthTenant;
  role: TenantRole;
}

export interface Member {
  id: string;
  role: TenantRole;
  status: string;
  user: AuthUser;
}

export interface Invite {
  id: string;
  email: string;
  role: TenantRole;
  acceptedAt: string | null;
  expiresAt: string;
}

// --- calls ---

export async function register(input: {
  email: string;
  password: string;
  name: string;
  tenantName: string;
}) {
  const data = await request<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
  storeTokens(data);
  return data;
}

export async function login(input: { email: string; password: string }) {
  const data = await request<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
  storeTokens(data);
  return data;
}

export function me() {
  return request<{ user: AuthUser; tenant: AuthTenant; role: TenantRole; isPlatformAdmin: boolean }>(
    "/auth/me",
  );
}

export function listMembers() {
  return request<Member[]>("/tenants/members");
}

export function listInvites() {
  return request<Invite[]>("/tenants/invites");
}

export function createInvite(input: { email: string; role: TenantRole }) {
  return request<Invite & { acceptUrl: string }>("/tenants/invites", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function acceptInvite(input: { token: string; password?: string; name?: string }) {
  return request<AuthResponse>("/auth/accept-invite", {
    method: "POST",
    body: JSON.stringify(input),
  }).then((data) => {
    storeTokens(data);
    return data;
  });
}

// --- WhatsApp channels ---

export interface Channel {
  id: string;
  type: ChannelType;
  wabaId: string | null;
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
  externalId: string | null;
  displayName: string | null;
  status: "active" | "disconnected";
  messagingTier: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  createdAt: string;
}

export interface MessageLogEntry {
  id: string;
  direction: "inbound" | "outbound";
  status: string;
  waMessageId: string | null;
  createdAt: string;
  contact: { id: string; whatsappNumber: string | null; name: string | null };
}

export function listChannels() {
  return request<Channel[]>("/channels");
}

export function createChannel(input: {
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber: string;
  accessToken: string;
}) {
  return request<Channel>("/channels", { method: "POST", body: JSON.stringify(input) });
}

export function disconnectChannel(channelId: string) {
  return request<Channel>(`/channels/${channelId}/disconnect`, { method: "POST" });
}

export function listChannelTemplates(channelId: string) {
  return request<unknown[]>(`/channels/${channelId}/templates`);
}

export function listChannelMessages(channelId: string) {
  return request<MessageLogEntry[]>(`/channels/${channelId}/messages`);
}

export function testSend(channelId: string, input: { to: string; templateName: string; languageCode?: string }) {
  return request<MessageLogEntry>(`/channels/${channelId}/test-send`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// --- Connections (Facebook Messenger, Instagram DM, Email) ---

export interface EmailChannelSettings {
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  emailAddress: string;
  fromName: string | null;
}

export interface ChannelConnection {
  id: string;
  type: ChannelType;
  /** Number, Page title, @handle or mailbox — whatever names this connection to a human. */
  label: string;
  externalId: string | null;
  displayName: string | null;
  displayPhoneNumber: string | null;
  wabaId: string | null;
  phoneNumberId: string | null;
  status: "active" | "disconnected";
  hasCredentials: boolean;
  email: EmailChannelSettings | null;
  pageId: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  createdAt: string;
}

export interface EmailSyncResult {
  channelId: string;
  fetched: number;
  imported: number;
  lastSyncedAt: string;
}

/** Every connected channel, WhatsApp included. */
export function listConnections() {
  return request<ChannelConnection[]>("/connections");
}

export function connectMessenger(input: { pageId: string; accessToken: string; enabled?: boolean }) {
  return request<ChannelConnection>("/connections/facebook", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** The Page access token is reused when Messenger is already connected. */
export function connectInstagram(input: {
  instagramAccountId: string;
  accessToken?: string;
  pageId?: string;
  enabled?: boolean;
}) {
  return request<ChannelConnection>("/connections/instagram", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Leave `password` out to keep the stored one. */
export function connectEmail(input: {
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  emailAddress: string;
  password?: string;
  fromName?: string;
  enabled?: boolean;
}) {
  return request<ChannelConnection>("/connections/email", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function syncEmailChannel(channelId: string) {
  return request<EmailSyncResult>(`/connections/${channelId}/sync`, { method: "POST" });
}

export function setConnectionEnabled(channelId: string, enabled: boolean) {
  return request<ChannelConnection>(`/connections/${channelId}/${enabled ? "enable" : "disable"}`, {
    method: "POST",
  });
}

/** Disconnects rather than deleting once the channel has message history. */
export function removeConnection(channelId: string) {
  return request<{ id: string; deleted: boolean }>(`/connections/${channelId}`, { method: "DELETE" });
}

// --- Contacts ---

export interface ContactListSummary {
  id: string;
  name: string;
  createdAt: string;
  _count: { members: number };
}

export interface ImportResult {
  listId: string | null;
  listName: string;
  totalDataRows: number;
  invalidRowCount: number;
  duplicateInFileCount: number;
  newContacts: number;
  existingContactsLinked: number;
  /** Existing contacts whose custom answers the file topped up. */
  updatedContacts: number;
  /** Columns that landed on a contact field. */
  customFieldColumns: { column: string; field: string }[];
  /** Headers that matched no contact field, so nothing was imported from them. */
  ignoredColumns: string[];
  /** Cells a field could not hold; the row was kept, the cell dropped. */
  invalidValueCount: number;
  sampleIssues: string[];
}

export interface Contact {
  id: string;
  channelType: ChannelType;
  /** Their id on that channel — phone number, Messenger PSID, Instagram IGSID or email. */
  externalId: string | null;
  whatsappNumber: string | null;
  name: string | null;
  email: string | null;
  languageCode: string | null;
  source: string | null;
  optedIn: boolean;
  /** When false, automations stop auto-replying to this contact. */
  botEnabled: boolean;
  /** Answers to the tenant's custom contact fields, keyed by field key. */
  attributesJson: CustomFieldValues | null;
  createdAt: string;
}

export function listContactLists() {
  return request<ContactListSummary[]>("/contacts/lists");
}

export function listContacts(limit?: number) {
  return request<Contact[]>(limit ? `/contacts?limit=${limit}` : "/contacts");
}

export function updateContact(
  contactId: string,
  input: {
    name?: string | null;
    email?: string | null;
    languageCode?: string | null;
    optedIn?: boolean;
    botEnabled?: boolean;
    /** Omitted keys keep their stored answer. */
    customFields?: CustomFieldValues;
  },
) {
  return request<Contact>(`/contacts/${contactId}`, { method: "PATCH", body: JSON.stringify(input) });
}

/** Erases the contacts along with their message history — confirm before calling. */
export function deleteContact(contactId: string) {
  return request<{ id: string; deleted: boolean }>(`/contacts/${contactId}`, { method: "DELETE" });
}

export function bulkDeleteContacts(ids: string[]) {
  return request<{ deleted: number }>("/contacts/bulk-delete", {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
}

/** Wipes the entire audience, message history included. */
export function deleteAllContacts() {
  return request<{ deleted: number }>("/contacts/delete-all", { method: "POST" });
}

export function createContactList(input: { name: string; contactIds?: string[] }) {
  return request<ContactListSummary>("/contacts/lists", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function addContactsToList(listId: string, contactIds: string[]) {
  return request<ContactListSummary>(`/contacts/lists/${listId}/members`, {
    method: "POST",
    body: JSON.stringify({ contactIds }),
  });
}

export function deleteContactList(listId: string) {
  return request<{ id: string; deleted: boolean }>(`/contacts/lists/${listId}`, { method: "DELETE" });
}

export function createContact(input: {
  whatsappNumber: string;
  name?: string;
  customFields?: CustomFieldValues;
}) {
  return request<Contact>("/contacts", { method: "POST", body: JSON.stringify(input) });
}

export function importContacts(input: { listName: string; csvText: string }) {
  return request<ImportResult>("/contacts/import", { method: "POST", body: JSON.stringify(input) });
}

// --- Catalogue ---

export interface Product {
  id: string;
  name: string;
  sku: string | null;
  description: string | null;
  /** Major units (rupees, dollars), not paise. */
  price: number;
  currency: string;
  /** null = stock isn't tracked for this product. */
  stock: number | null;
  taxPercent: number;
  taxName: string | null;
  category: string | null;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductInput {
  name: string;
  sku?: string;
  description?: string;
  price: number;
  currency?: string;
  stock?: number | null;
  taxPercent?: number;
  taxName?: string;
  category?: string;
  imageUrl?: string;
}

export interface PublicCatalogue {
  tenant: { name: string; slug: string };
  products: Product[];
}

export function listProducts() {
  return request<Product[]>("/products");
}

export function createProduct(input: ProductInput) {
  return request<Product>("/products", { method: "POST", body: JSON.stringify(input) });
}

export function updateProduct(productId: string, input: Partial<ProductInput>) {
  return request<Product>(`/products/${productId}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteProduct(productId: string) {
  return request<{ id: string; deleted: boolean }>(`/products/${productId}`, { method: "DELETE" });
}

/** The shopper-facing catalogue behind a shared link — no token required. */
export function getPublicCatalogue(slug: string) {
  return request<PublicCatalogue>(`/public/catalogue/${encodeURIComponent(slug)}`);
}

// --- Campaigns ---

export interface Campaign {
  id: string;
  status: "draft" | "scheduled" | "sending" | "completed" | "failed";
  createdAt: string;
  template?: { name: string; language: string };
  channel: { displayPhoneNumber: string | null };
  targetList: { name: string };
  recipientStats?: Record<string, number>;
}

export interface CampaignRecipient {
  id: string;
  status: "pending" | "queued" | "sent" | "delivered" | "read" | "failed";
  error: string | null;
  contact: { whatsappNumber: string | null; name: string | null };
}

export interface CampaignDetail extends Campaign {
  recipients: CampaignRecipient[];
}

export function listCampaigns() {
  return request<Campaign[]>("/campaigns");
}

export function getCampaign(id: string) {
  return request<CampaignDetail>(`/campaigns/${id}`);
}

export function launchCampaign(input: {
  channelId: string;
  targetListId: string;
  templateName: string;
}) {
  return request<CampaignDetail>("/campaigns", { method: "POST", body: JSON.stringify(input) });
}

// --- Automations ---

export interface AutomationStep {
  id: string;
  order: number;
  action: "send_text" | "send_template";
  configJson: { body?: string; templateName?: string; languageCode?: string };
  delaySeconds: number;
}

export interface Automation {
  id: string;
  name: string;
  isActive: boolean;
  triggerType: "keyword" | "welcome" | "external";
  triggerConfigJson: { keywords?: string[]; matchType?: "contains" | "exact" };
  createdAt: string;
  steps: AutomationStep[];
  channel: {
    type: ChannelType;
    displayPhoneNumber: string | null;
    displayName: string | null;
    externalId: string | null;
  };
}

export interface CreateAutomationInput {
  name: string;
  channelId: string;
  triggerType: "keyword" | "welcome";
  keywords?: string[];
  matchType?: "contains" | "exact";
  steps: {
    action: "send_text" | "send_template";
    value: string;
    languageCode?: string;
    delaySeconds?: number;
  }[];
}

export function listAutomations() {
  return request<Automation[]>("/automations");
}

export function createAutomation(input: CreateAutomationInput) {
  return request<Automation>("/automations", { method: "POST", body: JSON.stringify(input) });
}

export function setAutomationActive(id: string, isActive: boolean) {
  return request<Automation>(`/automations/${id}/${isActive ? "activate" : "deactivate"}`, {
    method: "POST",
  });
}

export function deleteAutomation(id: string) {
  return request<{ deleted: boolean }>(`/automations/${id}`, { method: "DELETE" });
}

// --- Billing ---

export interface PlanRecord {
  id: string;
  code: PlanCode;
  name: string;
  priceInPaise: number;
  razorpayPlanId: string | null;
  maxContacts: number;
  maxChannels: number;
  maxAutomations: number;
  maxTeamSeats: number;
  maxApiRequestsPerMonth: number;
  aiAutoReply: boolean;
  advancedAnalytics: boolean;
  prioritySupport: boolean;
}

export interface BillingOverview {
  currentPlan: PlanRecord;
  subscription: { status: string; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean } | null;
  overLimit: boolean;
  billingConfigured: boolean;
  usage: {
    contacts: number;
    channels: number;
    automations: number;
    teamSeats: number;
    apiRequests: number;
  };
  limits: {
    maxContacts: number;
    maxChannels: number;
    maxAutomations: number;
    maxTeamSeats: number;
    maxApiRequestsPerMonth: number;
  };
  availablePlans: PlanRecord[];
}

export function getBillingOverview() {
  return request<BillingOverview>("/billing");
}

export function startCheckout(planCode: PlanCode) {
  return request<{
    planCode: PlanCode;
    providerSubscriptionId: string;
    checkoutPayload: { short_url?: string };
  }>("/billing/checkout", { method: "POST", body: JSON.stringify({ planCode }) });
}

// --- Analytics ---

export interface MessageTotals {
  outbound: number;
  delivered: number;
  read: number;
  failed: number;
  inbound: number;
  deliveryRate: number;
  readRate: number;
  failureRate: number;
}

export interface DailyPoint {
  date: string;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  inbound: number;
}

export interface ChannelBreakdown {
  channelId: string;
  channelType: ChannelType;
  label: string;
  displayPhoneNumber: string | null;
  outbound: number;
  delivered: number;
  read: number;
  failed: number;
  inbound: number;
}

export interface AnalyticsOverview {
  since: string;
  totals: MessageTotals;
  dailySeries: DailyPoint[];
  byChannel: ChannelBreakdown[];
}

export function getAnalyticsOverview(days = 14, channelId?: string) {
  const params = new URLSearchParams({ days: String(days) });
  if (channelId) params.set("channelId", channelId);
  return request<AnalyticsOverview>(`/analytics/overview?${params.toString()}`);
}

// --- Platform admin / Embedded Signup ---

export interface PlatformPublicConfig {
  metaAppId: string | null;
  embeddedSignupConfigId: string | null;
  /** Facebook Login for Business config for "Connect with Meta" lead ads; optional. */
  leadAdsConfigId: string | null;
  configured: boolean;
}

export interface PlatformSettings {
  metaAppId: string | null;
  embeddedSignupConfigId: string | null;
  leadAdsConfigId: string | null;
  hasSecret: boolean;
}

export function getPlatformPublicConfig() {
  return request<PlatformPublicConfig>("/platform/public-config");
}

export function getPlatformSettings() {
  return request<PlatformSettings>("/platform/settings");
}

export function updatePlatformSettings(input: {
  metaAppId?: string;
  metaAppSecret?: string;
  metaEmbeddedSignupConfigId?: string;
  metaLeadAdsConfigId?: string;
}) {
  return request<PlatformSettings>("/platform/settings", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function completeEmbeddedSignup(input: {
  code: string;
  wabaId: string;
  phoneNumberId?: string;
  coexistence?: boolean;
}) {
  return request<Channel>("/channels/embedded-signup", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// --- Inbox (live chat) ---

export type LabelColor = "slate" | "brand" | "green" | "amber" | "red" | "purple";

export interface Label {
  id: string;
  name: string;
  color: LabelColor;
  _count?: { contacts: number };
}

export interface AssignedUser {
  id: string;
  name: string | null;
  email: string;
}

export interface InboxConversation {
  contactId: string;
  channelType: ChannelType;
  /** Their address on that channel — phone number, @handle or email. */
  handle: string;
  whatsappNumber: string | null;
  name: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string;
  lastMessageDirection: "inbound" | "outbound" | null;
  /** Meta's 24h customer-service window — free-form replies need it open. */
  windowOpen: boolean;
  windowExpiresAt: string | null;
  assignedUserId: string | null;
  assignedUser: AssignedUser | null;
  labels: Label[];
}

export interface InboxMessage {
  id: string;
  direction: "inbound" | "outbound";
  text: string;
  kind: string;
  status: string;
  createdAt: string;
}

export interface InboxThread {
  contact: {
    id: string;
    channelType: ChannelType;
    handle: string;
    whatsappNumber: string | null;
    name: string | null;
    email: string | null;
    languageCode: string | null;
    optedIn: boolean;
    botEnabled: boolean;
    createdAt: string;
    assignedUserId: string | null;
    assignedUser: AssignedUser | null;
    labels: Label[];
  };
  windowOpen: boolean;
  windowExpiresAt: string | null;
  messages: InboxMessage[];
}

export function listConversations() {
  return request<InboxConversation[]>("/inbox/conversations");
}

export function getConversation(contactId: string) {
  return request<InboxThread>(`/inbox/conversations/${contactId}`);
}

export function replyToConversation(contactId: string, body: string) {
  return request<{ id: string }>(`/inbox/conversations/${contactId}/reply`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

/**
 * Sends an approved template — the only way to message a contact outside the
 * 24-hour window, including one who has never been messaged before.
 */
export function sendConversationTemplate(contactId: string, templateId: string) {
  return request<{ id: string }>(`/inbox/conversations/${contactId}/send-template`, {
    method: "POST",
    body: JSON.stringify({ templateId }),
  });
}

/** Pass null to unassign. */
export function assignConversation(contactId: string, userId: string | null) {
  return request<{ id: string; assignedUserId: string | null; assignedUser: AssignedUser | null }>(
    `/inbox/conversations/${contactId}/assign`,
    { method: "PATCH", body: JSON.stringify({ userId }) },
  );
}

/** Replaces the contact's labels with exactly this set. */
export function setConversationLabels(contactId: string, labelIds: string[]) {
  return request<Label[]>(`/inbox/conversations/${contactId}/labels`, {
    method: "PUT",
    body: JSON.stringify({ labelIds }),
  });
}

export function listLabels() {
  return request<Label[]>("/inbox/labels");
}

export function createLabel(input: { name: string; color?: LabelColor }) {
  return request<Label>("/inbox/labels", { method: "POST", body: JSON.stringify(input) });
}

export function deleteLabel(labelId: string) {
  return request<{ id: string; deleted: boolean }>(`/inbox/labels/${labelId}`, { method: "DELETE" });
}

// --- Templates ---

export interface MessageTemplate {
  id: string;
  channelId: string;
  name: string;
  category: string;
  language: string;
  status: "draft" | "pending" | "approved" | "rejected";
  metaTemplateId: string | null;
  /** Meta's component payload, as stored — the BODY component holds the text. */
  bodyJson?: { components?: unknown[] };
  createdAt: string;
  updatedAt: string;
}

export function listTemplates() {
  return request<MessageTemplate[]>("/templates");
}

export interface TemplateSyncResult {
  imported: number;
  updated: number;
  channels: number;
  templates: MessageTemplate[];
}

/** Imports templates that already exist on the connected WABAs in Meta. */
export function syncTemplates() {
  return request<TemplateSyncResult>("/templates/sync", { method: "POST" });
}

export function createTemplate(input: {
  channelId: string;
  name: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  language: string;
  bodyText: string;
  bodyVariableExamples?: string[];
}) {
  return request<MessageTemplate>("/templates", { method: "POST", body: JSON.stringify(input) });
}

/** Meta treats name and language as immutable, so only body/category can change. */
export function updateTemplate(
  templateId: string,
  input: {
    bodyText: string;
    category?: "MARKETING" | "UTILITY" | "AUTHENTICATION";
    bodyVariableExamples?: string[];
  },
) {
  return request<MessageTemplate>(`/templates/${templateId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteTemplate(templateId: string) {
  return request<{ id: string; deleted: boolean }>(`/templates/${templateId}`, { method: "DELETE" });
}

// --- Platform admin: cross-tenant directory ---

export interface PlatformPlan {
  id: string;
  code: string;
  name: string;
  priceInPaise: number;
  maxChannels: number;
  maxContacts: number;
  maxAutomations: number;
  maxTeamSeats: number;
  maxApiRequestsPerMonth: number;
}

export interface PlatformTenant {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  /** True when what they already hold exceeds their plan — new records are blocked until they are back under. */
  overLimit: boolean;
  plan: { name: string; code: string; priceInPaise: number };
  subscription: { status: string; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean } | null;
  memberships: { user: { email: string; name: string | null } }[];
  _count: { memberships: number; channels: number };
}

export interface PlatformChannel extends Channel {
  tenant: { id: string; name: string };
}

export function getPlatformTenants() {
  return request<PlatformTenant[]>("/platform/tenants");
}

export function createPlatformTenant(input: {
  tenantName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
}) {
  return request<{ user: AuthUser; tenant: AuthTenant }>("/platform/tenants", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getPlatformPlans() {
  return request<PlatformPlan[]>("/platform/plans");
}

/** Moves a customer onto another plan by hand — the agency bills them outside the app. */
export function setPlatformTenantPlan(tenantId: string, planCode: string) {
  return request<PlatformTenant>(`/platform/tenants/${tenantId}/plan`, {
    method: "PATCH",
    body: JSON.stringify({ planCode }),
  });
}

export function getPlatformChannels() {
  return request<PlatformChannel[]>("/platform/channels");
}

// --- CRM: leads ---

export interface LeadOwner {
  id: string;
  name: string | null;
  email: string;
}

/** An answer map for a tenant's custom fields, keyed by field key. */
export interface CustomFieldValues {
  [key: string]: string | number | boolean;
}

export interface Lead {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  source: string;
  status: LeadStatus;
  valuePaise: number | null;
  notes: string | null;
  ownerUserId: string | null;
  owner: LeadOwner | null;
  /** Answers to the tenant's custom fields, keyed by field key. */
  customFieldsJson: CustomFieldValues | null;
  metaLeadId: string | null;
  metaAdId: string | null;
  metaFormLink: { id: string; formId: string; formName: string | null; pageName: string | null } | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  isHot: boolean;
  expectedCloseAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeadSummary {
  total: number;
  byStatus: Record<LeadStatus, number>;
}

export interface LeadInput {
  name: string;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
  status?: LeadStatus;
  source?: string | null;
  valuePaise?: number | null;
  notes?: string | null;
  ownerUserId?: string | null;
  customFields?: Record<string, string | number | boolean>;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  isHot?: boolean;
  expectedCloseAt?: string | null;
}

export function listLeads(
  params: { status?: string; q?: string; limit?: number; owner?: string; hot?: boolean } = {},
) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.q) query.set("q", params.q);
  if (params.limit) query.set("limit", String(params.limit));
  if (params.owner) query.set("owner", params.owner);
  if (params.hot) query.set("hot", "true");
  const suffix = query.toString();
  return request<Lead[]>(`/leads${suffix ? `?${suffix}` : ""}`);
}

export function getLeadSummary() {
  return request<LeadSummary>("/leads/summary");
}

export function createLead(input: LeadInput) {
  return request<Lead>("/leads", { method: "POST", body: JSON.stringify(input) });
}

export function updateLead(leadId: string, input: Partial<LeadInput>) {
  return request<Lead>(`/leads/${leadId}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteLead(leadId: string) {
  return request<{ id: string; deleted: boolean }>(`/leads/${leadId}`, { method: "DELETE" });
}

// --- Field sales: activities (calls, visits, demos, follow-ups, notes) ---

export interface Activity {
  id: string;
  leadId: string;
  type: ActivityType;
  status: ActivityStatus;
  title: string | null;
  notes: string | null;
  outcome: string | null;
  ownerUserId: string | null;
  owner: LeadOwner | null;
  createdByUserId: string | null;
  scheduledAt: string | null;
  /** Visit check-in time; completedAt is check-out. */
  startedAt: string | null;
  completedAt: string | null;
  durationSeconds: number | null;
  latitude: number | null;
  longitude: number | null;
  distanceMeters: number | null;
  accuracyMeters: number | null;
  endLatitude: number | null;
  endLongitude: number | null;
  createdAt: string;
  lead: {
    id: string;
    name: string;
    company: string | null;
    phone: string | null;
    status: LeadStatus;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
  };
}

export interface ActivityInput {
  leadId: string;
  type: ActivityType;
  /** in_progress is set only by a visit check-in. */
  status?: Exclude<ActivityStatus, "in_progress">;
  title?: string | null;
  notes?: string | null;
  outcome?: string | null;
  ownerUserId?: string | null;
  scheduledAt?: string | null;
  completedAt?: string | null;
}

export function listActivities(
  params: {
    leadId?: string;
    owner?: string;
    status?: ActivityStatus;
    type?: ActivityType;
    from?: string;
    to?: string;
    startedFrom?: string;
    startedTo?: string;
    limit?: number;
  } = {},
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  const suffix = query.toString();
  return request<Activity[]>(`/activities${suffix ? `?${suffix}` : ""}`);
}

export interface FieldSummary {
  scope: "me" | "team";
  activeVisit: Activity | null;
  today: Activity[];
  overdueCount: number;
  month: { calls: number; visits: number; demos: number; closings: number; wonValuePaise: number; collectedPaise: number };
  openPipeline: { count: number; valuePaise: number };
  targetMonth: string;
  /** This month's target for the viewer (or the team, in team scope); null when none is set. */
  targetPaise: number | null;
}

/** Today's plan and this month's numbers; day and month bounds are the viewer's local ones. */
export function getFieldSummary(scope: "me" | "team" = "me", now = new Date()) {
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const params = new URLSearchParams({
    dayStart: dayStart.toISOString(),
    dayEnd: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString(),
    monthStart: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
    scope,
  });
  return request<FieldSummary>(`/field/summary?${params}`);
}

export function createActivity(input: ActivityInput) {
  return request<Activity>("/activities", { method: "POST", body: JSON.stringify(input) });
}

export function updateActivity(activityId: string, input: Partial<Omit<ActivityInput, "leadId">>) {
  return request<Activity>(`/activities/${activityId}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteActivity(activityId: string) {
  return request<{ id: string; deleted: boolean }>(`/activities/${activityId}`, { method: "DELETE" });
}

// --- Custom fields (the same builder behind the lead and contact forms) ---

export interface CustomFieldDefinition {
  id: string;
  entity: CustomFieldEntity;
  key: string;
  label: string;
  type: CustomFieldType;
  /** Choices for dropdown and radio fields; null for the free-entry types. */
  optionsJson: string[] | null;
  required: boolean;
  isActive: boolean;
  placeholder: string | null;
  helpText: string | null;
  order: number;
  createdAt: string;
}

export interface CustomFieldInputValues {
  label: string;
  type: CustomFieldType;
  options?: string[];
  required?: boolean;
  placeholder?: string;
  helpText?: string;
}

/** Each entity has its own route, so a request can only ever touch its own fields. */
function fieldsPath(entity: CustomFieldEntity): string {
  return entity === "lead" ? "/lead-fields" : "/contact-fields";
}

export function listCustomFields(entity: CustomFieldEntity) {
  return request<CustomFieldDefinition[]>(fieldsPath(entity));
}

export function createCustomField(entity: CustomFieldEntity, input: CustomFieldInputValues) {
  return request<CustomFieldDefinition>(fieldsPath(entity), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** The key and type are fixed once created, so answers already on file stay valid. */
export function updateCustomField(
  entity: CustomFieldEntity,
  fieldId: string,
  input: {
    label?: string;
    options?: string[];
    required?: boolean;
    isActive?: boolean;
    placeholder?: string;
    helpText?: string;
  },
) {
  return request<CustomFieldDefinition>(`${fieldsPath(entity)}/${fieldId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteCustomField(entity: CustomFieldEntity, fieldId: string) {
  return request<{ id: string; deleted: boolean }>(`${fieldsPath(entity)}/${fieldId}`, {
    method: "DELETE",
  });
}

export function reorderCustomFields(entity: CustomFieldEntity, ids: string[]) {
  return request<CustomFieldDefinition[]>(`${fieldsPath(entity)}/reorder`, {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
}

// --- CRM: Meta lead-ads forms ---

export interface MetaLeadFormLink {
  id: string;
  pageId: string;
  pageName: string | null;
  formId: string;
  formName: string | null;
  isActive: boolean;
  /** Set when the form came from "Connect with Meta" rather than a hand-entered token. */
  connectionId: string | null;
  /** The form's questions as last read from Meta. */
  questions: MetaFormQuestion[];
  /** Meta question name -> "name" | "phone" | "email" | "company" | "notes" | "custom:<key>" | "ignore". */
  fieldMapping: Record<string, string>;
  defaultStatus: LeadStatus;
  leadCount: number;
  lastLeadAt: string | null;
  lastSyncAt: string | null;
  createdAt: string;
}

export interface MetaFormQuestion {
  key: string;
  label: string;
  type?: string;
}

export function listMetaLeadForms() {
  return request<MetaLeadFormLink[]>("/lead-sources/meta");
}

export function linkMetaLeadForm(input: {
  pageId: string;
  formId: string;
  pageAccessToken: string;
  pageName?: string;
  formName?: string;
  defaultStatus?: LeadStatus;
  fieldMapping?: Record<string, string>;
}) {
  return request<{ form: MetaLeadFormLink; questions: MetaFormQuestion[]; warning?: string }>(
    "/lead-sources/meta",
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function updateMetaLeadForm(
  linkId: string,
  input: {
    isActive?: boolean;
    fieldMapping?: Record<string, string>;
    defaultStatus?: LeadStatus;
    pageAccessToken?: string;
    formName?: string;
    pageName?: string;
  },
) {
  return request<MetaLeadFormLink>(`/lead-sources/meta/${linkId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteMetaLeadForm(linkId: string) {
  return request<{ id: string; deleted: boolean }>(`/lead-sources/meta/${linkId}`, { method: "DELETE" });
}

export function getMetaFormQuestions(linkId: string) {
  return request<{ questions: MetaFormQuestion[]; warning?: string }>(
    `/lead-sources/meta/${linkId}/questions`,
  );
}

/** Pulls submissions Meta already holds — the catch-up for leads that predate the webhook. */
export function syncMetaLeadForm(linkId: string, limit?: number) {
  return request<{ created: number; skipped: number; form: MetaLeadFormLink }>(
    `/lead-sources/meta/${linkId}/sync${limit ? `?limit=${limit}` : ""}`,
    { method: "POST" },
  );
}

// --- CRM: "Connect with Meta" for lead ads ---

export interface MetaLeadPage {
  pageId: string;
  pageName: string | null;
  /** Whether the app is subscribed to the Page's leadgen webhook. */
  subscribed: boolean;
  lastError: string | null;
}

export interface MetaLeadConnection {
  fbUserId: string;
  fbUserName: string | null;
  /** Applies to every form; each form's own mapping wins over it. */
  defaultFieldMapping: Record<string, string>;
  defaultStatus: LeadStatus;
  lastSyncAt: string | null;
  lastError: string | null;
  createdAt: string;
  pages: MetaLeadPage[];
}

export interface MetaLeadDiscovery {
  pages: number;
  forms: number;
  newForms: number;
}

export function getMetaLeadConnection() {
  return request<{ connection: MetaLeadConnection | null }>("/lead-sources/meta-connection");
}

/** Finishes "Connect with Meta": the API swaps the login for tokens and links every form it finds. */
export function connectMetaLeads(input: { code?: string; accessToken?: string }) {
  return request<{ connection: MetaLeadConnection | null; discovered: MetaLeadDiscovery }>(
    "/lead-sources/meta-connection",
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function refreshMetaLeadConnection() {
  return request<{ connection: MetaLeadConnection | null; discovered: MetaLeadDiscovery }>(
    "/lead-sources/meta-connection/refresh",
    { method: "POST" },
  );
}

export function updateMetaLeadConnection(input: {
  defaultFieldMapping?: Record<string, string>;
  defaultStatus?: LeadStatus;
}) {
  return request<{ connection: MetaLeadConnection | null }>("/lead-sources/meta-connection", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function disconnectMetaLeads() {
  return request<{ disconnected: boolean; formsRemoved: number }>("/lead-sources/meta-connection", {
    method: "DELETE",
  });
}

// --- Integrations (per-tenant connections to third-party services) ---

export interface IntegrationConnection {
  status: IntegrationStatus;
  /** "test" or "live", read from the key prefix. */
  mode: string | null;
  accountLabel: string | null;
  /** Non-secret fields as entered; secrets only as a masked tail. */
  values: Record<string, string>;
  connectedBy: { id: string; name: string | null; email: string } | null;
  connectedAt: string;
  lastCheckedAt: string | null;
  lastError: string | null;
}

export interface Integration {
  provider: string;
  name: string;
  category: string;
  description: string;
  initials: string;
  docsUrl: string;
  fields: IntegrationFieldSpec[];
  /** Null until this workspace connects it. */
  connection: IntegrationConnection | null;
}

export function listIntegrations() {
  return request<Integration[]>("/integrations");
}

/** Sends the provider's own fields; a blank secret keeps the stored one. */
export function connectIntegration(provider: string, credentials: Record<string, string>) {
  return request<Integration>(`/integrations/${provider}/connect`, {
    method: "POST",
    body: JSON.stringify({ credentials }),
  });
}

/** Re-checks the stored keys against the provider. */
export function testIntegration(provider: string) {
  return request<Integration>(`/integrations/${provider}/test`, { method: "POST" });
}

/** Pauses or resumes a connection without discarding its credentials. */
export function setIntegrationActive(provider: string, isActive: boolean) {
  return request<Integration>(`/integrations/${provider}`, {
    method: "PATCH",
    body: JSON.stringify({ isActive }),
  });
}

export function disconnectIntegration(provider: string) {
  return request<{ provider: string; disconnected: boolean }>(`/integrations/${provider}`, {
    method: "DELETE",
  });
}

// --- API keys (public REST API credential) ---

export interface ApiKeyRecord {
  id: string;
  name: string;
  prefix: string;
  /** The raw key. Only an admin of the workspace ever sees this. */
  key: string;
  lastUsedAt: string | null;
  createdAt: string;
}

export function getApiKey() {
  return request<ApiKeyRecord>("/api-keys");
}

/** Revokes the current key and mints a replacement — existing integrations break. */
export function regenerateApiKey(name?: string) {
  return request<ApiKeyRecord>("/api-keys/regenerate", {
    method: "POST",
    body: JSON.stringify(name ? { name } : {}),
  });
}

// --- Sales: quotations, payments, targets ---

export interface QuotationItem {
  id: string;
  productId: string | null;
  name: string;
  description: string | null;
  quantity: number;
  unitPricePaise: number;
  taxPercent: number;
  position: number;
}

export interface Quotation {
  id: string;
  leadId: string;
  number: string;
  status: QuotationStatus;
  currency: string;
  subtotalPaise: number;
  discountPaise: number;
  taxPaise: number;
  totalPaise: number;
  validUntil: string | null;
  notes: string | null;
  shareToken: string;
  pdfUrl: string;
  sentAt: string | null;
  respondedAt: string | null;
  createdAt: string;
  paidPaise: number;
  balancePaise: number;
  lead: { id: string; name: string; company: string | null; phone: string | null; email: string | null; address: string | null; status: LeadStatus };
  createdBy: { id: string; name: string | null; email: string } | null;
  items: QuotationItem[];
}

export interface QuotationItemInput {
  productId?: string;
  name?: string;
  description?: string;
  quantity: number;
  unitPricePaise?: number;
  taxPercent?: number;
}

export interface QuotationInput {
  leadId: string;
  items: QuotationItemInput[];
  discountPaise?: number;
  validUntil?: string | null;
  notes?: string | null;
}

export type SendQuotationResult =
  | { delivered: true; quotation: Quotation }
  | {
      delivered: false;
      reason: "no_phone" | "no_whatsapp_channel" | "window_closed";
      message: string;
      pdfUrl: string;
      shareLink: string | null;
    };

export interface BusinessProfile {
  legalName?: string;
  address?: string;
  gstin?: string;
  phone?: string;
  email?: string;
  terms?: string;
  validityDays?: number;
}

export function listQuotations(params: { leadId?: string; status?: QuotationStatus } = {}) {
  const query = new URLSearchParams();
  if (params.leadId) query.set("leadId", params.leadId);
  if (params.status) query.set("status", params.status);
  const suffix = query.toString();
  return request<Quotation[]>(`/quotations${suffix ? `?${suffix}` : ""}`);
}

export const getQuotation = (id: string) => request<Quotation>(`/quotations/${id}`);

export const createQuotation = (input: QuotationInput) =>
  request<Quotation>("/quotations", { method: "POST", body: JSON.stringify(input) });

export const updateQuotation = (
  id: string,
  input: Partial<Omit<QuotationInput, "leadId">> & { status?: QuotationStatus },
) => request<Quotation>(`/quotations/${id}`, { method: "PATCH", body: JSON.stringify(input) });

export const deleteQuotation = (id: string) =>
  request<{ id: string; deleted: boolean }>(`/quotations/${id}`, { method: "DELETE" });

export const sendQuotation = (id: string) =>
  request<SendQuotationResult>(`/quotations/${id}/send`, { method: "POST" });

export const getBusinessProfile = () => request<BusinessProfile>("/quotations/settings");

export const saveBusinessProfile = (input: BusinessProfile) =>
  request<BusinessProfile>("/quotations/settings", { method: "PUT", body: JSON.stringify(input) });

export interface Payment {
  id: string;
  leadId: string;
  quotationId: string | null;
  amountPaise: number;
  mode: PaymentMode;
  reference: string | null;
  notes: string | null;
  receivedAt: string;
  createdAt: string;
  lead: { id: string; name: string; company: string | null };
  quotation: { id: string; number: string; totalPaise: number } | null;
  collectedBy: { id: string; name: string | null; email: string } | null;
}

export interface PaymentInput {
  leadId: string;
  quotationId?: string;
  amountPaise: number;
  mode: PaymentMode;
  reference?: string;
  notes?: string;
  receivedAt?: string;
}

export function listPayments(params: { leadId?: string; collector?: string; from?: string; to?: string } = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  const suffix = query.toString();
  return request<Payment[]>(`/payments${suffix ? `?${suffix}` : ""}`);
}

export const createPayment = (input: PaymentInput) =>
  request<Payment>("/payments", { method: "POST", body: JSON.stringify(input) });

export const deletePayment = (id: string) =>
  request<{ id: string; deleted: boolean }>(`/payments/${id}`, { method: "DELETE" });

export interface TargetRow {
  amountPaise: number | null;
  achievedPaise: number;
  closings: number;
  collectedPaise: number;
}

export interface TargetsBoard {
  month: string;
  timeZone: string;
  team: TargetRow;
  reps: (TargetRow & { user: { id: string; name: string | null; email: string }; role: TenantRole })[];
}

export const getTargets = (month?: string) =>
  request<TargetsBoard>(`/targets${month ? `?month=${month}` : ""}`);

export const setTarget = (input: { month: string; userId: string | null; amountPaise: number }) =>
  request<{ month: string; userId: string | null; amountPaise: number | null }>("/targets", {
    method: "PUT",
    body: JSON.stringify(input),
  });
