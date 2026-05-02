import { cfFetch, cfFetchRaw, getAccountId } from "./client.js";

export interface RegisteredDomain {
  id: string;
  name: string;
  status: string;
  locked: boolean;
  auto_renew: boolean;
  expires_at: string;
}

export async function getDomainRegistration(
  domainName: string,
): Promise<RegisteredDomain | null> {
  const accountId = getAccountId();
  const res = await cfFetchRaw(
    `/accounts/${accountId}/registrar/domains/${domainName}`,
  );
  if (res.status === 404) return null;
  const body = (await res.json()) as { success: boolean; result: RegisteredDomain };
  if (!body.success) return null;
  return body.result;
}

export async function listRegisteredDomains(): Promise<RegisteredDomain[]> {
  const accountId = getAccountId();
  const res = await cfFetch<RegisteredDomain[]>(
    `/accounts/${accountId}/registrar/domains`,
  );
  return res.result ?? [];
}

export async function registerDomain(domainName: string): Promise<RegisteredDomain> {
  const accountId = getAccountId();

  const existing = await getDomainRegistration(domainName);
  if (existing) return existing;

  const res = await cfFetch<RegisteredDomain>(
    `/accounts/${accountId}/registrar/domains/${domainName}`,
    {
      method: "POST",
      body: JSON.stringify({
        years: 1,
        type: "new",
        auto_renew: false,
        privacy: false,
      }),
    },
  );
  return res.result;
}

export async function disableAutoRenew(domainName: string): Promise<void> {
  const accountId = getAccountId();
  await cfFetch(`/accounts/${accountId}/registrar/domains/${domainName}`, {
    method: "PUT",
    body: JSON.stringify({ auto_renew: false }),
  });
}
