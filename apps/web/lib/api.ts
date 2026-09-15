import type { ChannelType, PlanCode, TenantRole } from "@digitel/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAccessToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
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

export function createContact(input: { whatsappNumber: string; name?: string }) {
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
  languageCode?: string;
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
  configured: boolean;
}

export interface PlatformSettings {
  metaAppId: string | null;
  embeddedSignupConfigId: string | null;
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
}) {
  return request<PlatformSettings>("/platform/settings", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function completeEmbeddedSignup(input: { code: string; wabaId: string; phoneNumberId: string }) {
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

export interface PlatformTenant {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
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

export function getPlatformChannels() {
  return request<PlatformChannel[]>("/platform/channels");
}
