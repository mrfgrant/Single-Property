import { cfFetch } from "./client.js";

export interface Ruleset {
  id: string;
  name: string;
  phase: string;
  rules: Rule[];
}

export interface Rule {
  id?: string;
  action: string;
  action_parameters: Record<string, unknown>;
  expression: string;
  description: string;
}

const REDIRECT_RULESET_NAME = "PropSite Listing Redirect";
const REDIRECT_PHASE = "http_request_redirect";

async function getRedirectRuleset(zoneId: string): Promise<Ruleset | null> {
  const res = await cfFetch<Ruleset[]>(`/zones/${zoneId}/rulesets`);
  return res.result?.find((r) => r.phase === REDIRECT_PHASE) ?? null;
}

/**
 * Written during provisioning so that visiting the bare domain (or any
 * path that isn't already the listing page) automatically lands the
 * visitor on the correct property URL.
 *
 * Expression: host matches AND path does NOT already start with /listing
 * or /api (so in-page API calls and direct listing links are never looped).
 *
 * The close-time setRedirectRule() call replaces the entire ruleset with
 * a catch-all, so no extra teardown is needed when a listing closes.
 */
export async function setListingRootRedirect(
  zoneId: string,
  domainName: string,
  listingSlug: string,
): Promise<void> {
  const targetUrl = `https://${domainName}/listing/${listingSlug}`;

  const rule: Rule = {
    action: "redirect",
    action_parameters: {
      from_value: {
        status_code: 301,
        target_url: { value: targetUrl },
        preserve_query_string: false,
      },
    },
    expression: `(http.host eq "${domainName}" and not starts_with(http.request.uri.path, "/listing") and not starts_with(http.request.uri.path, "/api"))`,
    description: `PropSite root → listing redirect for ${domainName}`,
  };

  const existing = await getRedirectRuleset(zoneId);

  if (existing) {
    await cfFetch(`/zones/${zoneId}/rulesets/${existing.id}`, {
      method: "PUT",
      body: JSON.stringify({
        name: REDIRECT_RULESET_NAME,
        phase: REDIRECT_PHASE,
        rules: [rule],
      }),
    });
  } else {
    await cfFetch(`/zones/${zoneId}/rulesets`, {
      method: "POST",
      body: JSON.stringify({
        name: REDIRECT_RULESET_NAME,
        phase: REDIRECT_PHASE,
        rules: [rule],
      }),
    });
  }
}

export async function setRedirectRule(
  zoneId: string,
  domainName: string,
  redirectTo: string,
): Promise<void> {
  const rule: Rule = {
    action: "redirect",
    action_parameters: {
      from_value: {
        status_code: 301,
        target_url: { value: redirectTo },
        preserve_query_string: false,
      },
    },
    expression: `(http.host eq "${domainName}")`,
    description: `PropSite listing redirect for ${domainName}`,
  };

  const existing = await getRedirectRuleset(zoneId);

  if (existing) {
    await cfFetch(`/zones/${zoneId}/rulesets/${existing.id}`, {
      method: "PUT",
      body: JSON.stringify({
        name: REDIRECT_RULESET_NAME,
        phase: REDIRECT_PHASE,
        rules: [rule],
      }),
    });
  } else {
    await cfFetch(`/zones/${zoneId}/rulesets`, {
      method: "POST",
      body: JSON.stringify({
        name: REDIRECT_RULESET_NAME,
        phase: REDIRECT_PHASE,
        rules: [rule],
      }),
    });
  }
}

export async function clearRedirectRules(zoneId: string): Promise<void> {
  const existing = await getRedirectRuleset(zoneId);
  if (!existing) return;
  await cfFetch(`/zones/${zoneId}/rulesets/${existing.id}`, {
    method: "PUT",
    body: JSON.stringify({
      name: REDIRECT_RULESET_NAME,
      phase: REDIRECT_PHASE,
      rules: [],
    }),
  });
}
