import { redirect } from "next/navigation";

/** Meta lead ads moved under Integrations; old links and bookmarks land there. */
export default function LeadSourcesRedirect() {
  redirect("/dashboard/integrations/meta-lead-ads");
}
