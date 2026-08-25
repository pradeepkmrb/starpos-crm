export type TenantRole = "owner" | "admin" | "agent" | "viewer";

export interface JwtPayload {
  userId: string;
  tenantId: string;
  role: TenantRole;
}

export type EntitlementKind =
  | "contacts"
  | "channels"
  | "automations"
  | "teamSeats"
  | "apiRequests";
