import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import type {
  ActivityStatus,
  ActivityType,
  CustomFieldType,
  LeadStatus,
  TenantRole,
} from "@digitel/shared";

/** Set EXPO_PUBLIC_API_URL to point a dev build at a local API. */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://api-production-9e49.up.railway.app";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// --- token storage: the device keychain on phones, localStorage in a browser preview ---

const ACCESS_KEY = "digitel_access_token";
const REFRESH_KEY = "digitel_refresh_token";

async function readStored(key: string): Promise<string | null> {
  if (Platform.OS === "web") return globalThis.localStorage?.getItem(key) ?? null;
  return SecureStore.getItemAsync(key);
}

async function writeStored(key: string, value: string | null): Promise<void> {
  if (Platform.OS === "web") {
    if (value === null) globalThis.localStorage?.removeItem(key);
    else globalThis.localStorage?.setItem(key, value);
    return;
  }
  if (value === null) await SecureStore.deleteItemAsync(key);
  else await SecureStore.setItemAsync(key, value);
}

let accessToken: string | null = null;
let refreshToken: string | null = null;
let onSignedOut: (() => void) | null = null;

export async function loadStoredTokens(): Promise<boolean> {
  [accessToken, refreshToken] = await Promise.all([readStored(ACCESS_KEY), readStored(REFRESH_KEY)]);
  return !!refreshToken;
}

async function storeTokens(tokens: { accessToken: string; refreshToken: string } | null) {
  accessToken = tokens?.accessToken ?? null;
  refreshToken = tokens?.refreshToken ?? null;
  await Promise.all([writeStored(ACCESS_KEY, accessToken), writeStored(REFRESH_KEY, refreshToken)]);
}

/** Called when a refresh fails, so the app can drop back to the login screen. */
export function setSignedOutHandler(handler: () => void) {
  onSignedOut = handler;
}

// Access tokens live 15 minutes; one refresh in flight is shared by every
// request that hit a 401 at the same time.
let refreshing: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  if (!refreshToken) return false;
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;
      await storeTokens(await res.json());
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
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your internet connection.");
  }

  if (res.status === 401 && !retried && refreshToken) {
    if (await refreshTokens()) return request<T>(path, options, true);
    await storeTokens(null);
    onSignedOut?.();
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = Array.isArray(body.message) ? body.message.join(", ") : body.message;
    throw new ApiError(res.status, message ?? `Request failed (${res.status})`);
  }
  return body as T;
}

// --- types ---

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
}

export interface Me {
  user: AuthUser;
  tenant: { id: string; name: string; slug: string };
  role: TenantRole;
}

export interface LeadOwner {
  id: string;
  name: string | null;
  email: string;
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
  customFieldsJson: Record<string, string | number | boolean> | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  isHot: boolean;
  expectedCloseAt: string | null;
  createdAt: string;
}

export interface LeadInput {
  name?: string;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
  status?: LeadStatus;
  valuePaise?: number | null;
  notes?: string | null;
  ownerUserId?: string | null;
  address?: string | null;
  isHot?: boolean;
  expectedCloseAt?: string | null;
  customFields?: Record<string, string | number | boolean>;
}

export interface Activity {
  id: string;
  leadId: string;
  type: ActivityType;
  status: ActivityStatus;
  title: string | null;
  notes: string | null;
  outcome: string | null;
  owner: LeadOwner | null;
  scheduledAt: string | null;
  completedAt: string | null;
  durationSeconds: number | null;
  createdAt: string;
  lead: {
    id: string;
    name: string;
    company: string | null;
    phone: string | null;
    status: LeadStatus;
    address: string | null;
  };
}

export interface ActivityInput {
  leadId: string;
  type: ActivityType;
  status?: ActivityStatus;
  notes?: string | null;
  outcome?: string | null;
  scheduledAt?: string | null;
}

export interface FieldSummary {
  today: Activity[];
  overdueCount: number;
  month: { calls: number; visits: number; demos: number; closings: number; wonValuePaise: number };
  openPipeline: { count: number; valuePaise: number };
}

export interface CustomFieldDefinition {
  id: string;
  key: string;
  label: string;
  type: CustomFieldType;
  optionsJson: string[] | null;
  required: boolean;
  isActive: boolean;
  placeholder: string | null;
  helpText: string | null;
}

// --- calls ---

export async function login(email: string, password: string) {
  const data = await request<Me & { accessToken: string; refreshToken: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  await storeTokens(data);
  return data;
}

export async function logout() {
  await storeTokens(null);
}

export const getMe = () => request<Me>("/auth/me");

export function listLeads(params: { owner?: string; hot?: boolean; q?: string } = {}) {
  const query = new URLSearchParams({ limit: "500" });
  if (params.owner) query.set("owner", params.owner);
  if (params.hot) query.set("hot", "true");
  if (params.q) query.set("q", params.q);
  return request<Lead[]>(`/leads?${query}`);
}

export const getLead = (id: string) => request<Lead>(`/leads/${id}`);

export const createLead = (input: LeadInput) =>
  request<Lead>("/leads", { method: "POST", body: JSON.stringify(input) });

export const updateLead = (id: string, input: LeadInput) =>
  request<Lead>(`/leads/${id}`, { method: "PATCH", body: JSON.stringify(input) });

export const listLeadFields = () => request<CustomFieldDefinition[]>("/lead-fields");

export function listActivities(params: {
  leadId?: string;
  owner?: string;
  status?: ActivityStatus;
  from?: string;
  to?: string;
}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  return request<Activity[]>(`/activities?${query}`);
}

export const createActivity = (input: ActivityInput) =>
  request<Activity>("/activities", { method: "POST", body: JSON.stringify(input) });

export const updateActivity = (id: string, input: Partial<Omit<ActivityInput, "leadId">>) =>
  request<Activity>(`/activities/${id}`, { method: "PATCH", body: JSON.stringify(input) });

export function getFieldSummary(window: { dayStart: Date; dayEnd: Date; monthStart: Date }) {
  const query = new URLSearchParams({
    dayStart: window.dayStart.toISOString(),
    dayEnd: window.dayEnd.toISOString(),
    monthStart: window.monthStart.toISOString(),
  });
  return request<FieldSummary>(`/field/summary?${query}`);
}
