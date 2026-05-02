import { cfFetch, cfFetchRaw, getAccountId } from "./client.js";

export interface Zone {
  id: string;
  name: string;
  status: string;
}

export interface DnsRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  proxied: boolean;
  ttl: number;
}

export async function getZone(domainName: string): Promise<Zone | null> {
  const res = await cfFetch<Zone[]>(`/zones?name=${encodeURIComponent(domainName)}`);
  return res.result?.[0] ?? null;
}

export async function createZone(domainName: string): Promise<Zone> {
  const existing = await getZone(domainName);
  if (existing) return existing;

  const accountId = getAccountId();
  const res = await cfFetch<Zone>("/zones", {
    method: "POST",
    body: JSON.stringify({
      name: domainName,
      account: { id: accountId },
      jump_start: false,
    }),
  });
  return res.result;
}

export async function ensureZone(domainName: string): Promise<Zone> {
  const existing = await getZone(domainName);
  if (existing) return existing;
  return createZone(domainName);
}

export async function listDnsRecords(zoneId: string): Promise<DnsRecord[]> {
  const res = await cfFetch<DnsRecord[]>(`/zones/${zoneId}/dns_records`);
  return res.result ?? [];
}

export async function upsertDnsRecord(
  zoneId: string,
  record: { type: string; name: string; content: string; proxied: boolean; ttl?: number },
): Promise<DnsRecord> {
  const existing = await listDnsRecords(zoneId);
  const match = existing.find(
    (r) => r.type === record.type && r.name === record.name,
  );

  const payload = {
    type: record.type,
    name: record.name,
    content: record.content,
    proxied: record.proxied,
    ttl: record.ttl ?? 1,
  };

  if (match) {
    const res = await cfFetch<DnsRecord>(
      `/zones/${zoneId}/dns_records/${match.id}`,
      { method: "PUT", body: JSON.stringify(payload) },
    );
    return res.result;
  }

  const res = await cfFetch<DnsRecord>(`/zones/${zoneId}/dns_records`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return res.result;
}

export async function deleteDnsRecord(zoneId: string, recordId: string): Promise<void> {
  await cfFetch(`/zones/${zoneId}/dns_records/${recordId}`, {
    method: "DELETE",
  });
}

export async function upsertTxtRecord(
  zoneId: string,
  name: string,
  content: string,
): Promise<DnsRecord> {
  return upsertDnsRecord(zoneId, {
    type: "TXT",
    name,
    content,
    proxied: false,
    ttl: 300,
  });
}

export async function getDeploymentHostname(): Promise<string> {
  const hostname =
    process.env.SITE_DEPLOYMENT_HOSTNAME ??
    process.env.REPLIT_DEV_DOMAIN;
  if (!hostname) throw new Error("SITE_DEPLOYMENT_HOSTNAME is not set");
  return hostname.replace(/^https?:\/\//, "");
}
