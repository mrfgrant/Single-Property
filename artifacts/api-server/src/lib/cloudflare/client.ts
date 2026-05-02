const CF_BASE = "https://api.cloudflare.com/client/v4";

function getToken(): string {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error("CLOUDFLARE_API_TOKEN is not set");
  return token;
}

export function getAccountId(): string {
  const id = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!id) throw new Error("CLOUDFLARE_ACCOUNT_ID is not set");
  return id;
}

export interface CfResponse<T> {
  success: boolean;
  result: T;
  errors: { code: number; message: string }[];
  messages: string[];
}

export async function cfFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<CfResponse<T>> {
  const res = await fetch(`${CF_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const body = (await res.json()) as CfResponse<T>;

  if (!res.ok || !body.success) {
    const msg = body.errors?.map((e) => `[${e.code}] ${e.message}`).join("; ") ?? res.statusText;
    throw new Error(`Cloudflare API error (${res.status}) on ${path}: ${msg}`);
  }

  return body;
}

export async function cfFetchRaw(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${CF_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}
