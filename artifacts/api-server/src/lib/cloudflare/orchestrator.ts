import { db, automationRunsTable, type AutomationRun, type RunStep } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { pickAvailableDomain } from "./domainGenerator.js";
import { registerDomain, disableAutoRenew } from "./registrar.js";
import { ensureZone, upsertDnsRecord, getDeploymentHostname } from "./dns.js";
import { logger } from "../logger.js";

export interface ProvisionResult {
  runId: string;
  domainName: string | null;
  step: RunStep;
  status: string;
  replitHandoffNote?: string;
}

async function findOrCreateRun(listingId: string): Promise<AutomationRun> {
  const existing = await db
    .select()
    .from(automationRunsTable)
    .where(
      and(
        eq(automationRunsTable.listingId, listingId),
        eq(automationRunsTable.status, "completed"),
      ),
    )
    .limit(1);

  if (existing.length > 0) return existing[0];

  const inProgress = await db
    .select()
    .from(automationRunsTable)
    .where(
      and(
        eq(automationRunsTable.listingId, listingId),
        eq(automationRunsTable.status, "running"),
      ),
    )
    .limit(1);

  if (inProgress.length > 0) return inProgress[0];

  const [run] = await db
    .insert(automationRunsTable)
    .values({ listingId, step: "pending", status: "running" })
    .returning();

  return run;
}

async function advanceRun(
  runId: string,
  step: RunStep,
  fields: Partial<AutomationRun> = {},
): Promise<void> {
  await db
    .update(automationRunsTable)
    .set({ step, updatedAt: new Date(), ...fields })
    .where(eq(automationRunsTable.id, runId));
}

async function failRun(runId: string, errorMessage: string): Promise<void> {
  await db
    .update(automationRunsTable)
    .set({ status: "failed", errorMessage, updatedAt: new Date() })
    .where(eq(automationRunsTable.id, runId));
}

export async function provisionDomainForListing(
  listingId: string,
  address: string,
  city: string,
): Promise<ProvisionResult> {
  const run = await findOrCreateRun(listingId);

  if (run.status === "completed") {
    return {
      runId: run.id,
      domainName: run.domainName,
      step: run.step as RunStep,
      status: "completed",
    };
  }

  const runId = run.id;

  try {
    let domainName = run.domainName;

    if (run.step === "pending" || run.step === "domain_generated") {
      if (!domainName) {
        logger.info({ listingId, address, city }, "Picking available domain");
        domainName = await pickAvailableDomain(address, city);

        if (!domainName) {
          await failRun(runId, "No available domain candidates found for this address");
          return { runId, domainName: null, step: "domain_generated", status: "failed" };
        }
      }
      await advanceRun(runId, "domain_generated", { domainName });
    }

    if (!domainName) throw new Error("domainName is unexpectedly null after domain_generated step");

    if (run.step === "domain_generated") {
      logger.info({ domainName }, "Registering domain with Cloudflare");
      await registerDomain(domainName);
      await disableAutoRenew(domainName);
      await advanceRun(runId, "domain_registered");
    }

    let zoneId = run.cloudflareZoneId;

    if (run.step === "domain_registered" || !zoneId) {
      logger.info({ domainName }, "Ensuring DNS zone");
      const zone = await ensureZone(domainName);
      zoneId = zone.id;
      await advanceRun(runId, "zone_ready", { cloudflareZoneId: zoneId });
    }

    if (run.step === "zone_ready") {
      logger.info({ domainName, zoneId }, "Creating DNS CNAME record");
      const hostname = await getDeploymentHostname();
      const record = await upsertDnsRecord(zoneId, {
        type: "CNAME",
        name: domainName,
        content: hostname,
        proxied: true,
      });
      await advanceRun(runId, "dns_record_created", {
        cloudflareDnsRecordId: record.id,
      });
    }

    if (run.step === "dns_record_created") {
      await advanceRun(runId, "replit_handoff_pending");
    }

    if (run.step === "replit_handoff_pending") {
      await advanceRun(runId, "completed", { status: "completed" });
    }

    return {
      runId,
      domainName,
      step: "completed",
      status: "completed",
      replitHandoffNote: `Add custom domain "${domainName}" to your Replit deployment so Replit routes traffic correctly. DNS is already pointing to your deployment via Cloudflare proxy.`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ runId, listingId, err }, "Provision failed");
    await failRun(runId, msg);
    return { runId, domainName: run.domainName, step: run.step as RunStep, status: "failed" };
  }
}
