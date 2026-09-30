import { canEdit, canView, hasAccess, type AccessModule } from "@starpos-crm/shared";
import { useAuth } from "./auth";

/**
 * The signed-in person's menu access from their workspace role. The server
 * enforces the same rules; this only hides what they can't use.
 */
export function useAccess() {
  const { me } = useAuth();
  const permissions = me?.permissions ?? null;
  return {
    canView: (module: AccessModule) => (permissions ? canView(permissions, module) : false),
    canEdit: (module: AccessModule) => (permissions ? canEdit(permissions, module) : false),
    canViewAny: (modules: AccessModule[]) => (permissions ? hasAccess(permissions, modules, "view") : false),
    canEditAny: (modules: AccessModule[]) => (permissions ? hasAccess(permissions, modules, "edit") : false),
    webAccess: me?.webAccess ?? false,
  };
}
