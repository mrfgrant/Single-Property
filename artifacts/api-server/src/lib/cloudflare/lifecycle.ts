import { db, automationRunsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getZone } from "./dns.js";
import { setRedirectRule } from "./redirectRules.js";
import { logger } from "../logger.js";

const PLATFORM_HOMEPAGE = process.env.PLATFORM_HOMEPAGE_URL ?? "https://propsite.app";

export type ListingCloseStatus = "Sold" | "Withdrawn" | "Expired";

export async function handleListingClosed(
  listingId: string,
  status: ListingCloseStatus,
  agentWebsiteUrl?: string,
): Promise<{ success: boolean; redirectedTo: string } | { success: false; reason: string }> {
  const runs = await db
    .select()
    .from(automationRunsTable)
    .where(
      and(
        eq(automationRunsTable.listingId, listingId),
        eq(automationRunsTable.status, "completed"),
      ),
    )
    .limit(1);

  const run = runs[0];
  if (!run || !run.domainName) {
    return { success: false, reason: "No completed domain provisioning run found for this listing" };
  }

  const { domainName, cloudflareZoneId } = run;
  const redirectTo = agentWebsiteUrl ?? PLATFORM_HOMEPAGE;

  try {
    let zoneId = cloudflareZoneId;

    if (!zoneId) {
      const zone = await getZone(domainName);
      if (!zone) {
        return { success: false, reason: `No Cloudflare zone found for ${domainName}` };
      }
      zoneId = zone.id;
    }

    logger.info({ domainName, redirectTo, status }, "Setting listing-closed redirect");
    await setRedirectRule(zoneId, domainName, redirectTo);

    await db
      .update(automationRunsTable)
      .set({ redirectUrl: redirectTo, updatedAt: new Date() })
      .where(eq(automationRunsTable.id, run.id));

    return { success: true, redirectedTo: redirectTo };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ listingId, domainName, err }, "Failed to set listing-closed redirect");
    return { success: false, reason: msg };
  }
}
