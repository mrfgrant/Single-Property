import { getMlsConfig, type MlsConfig } from "./config.js";
import { logger } from "../logger.js";

/**
 * Minimal RESO Web API client.
 *
 * RESO Web API is an OData 4.0 endpoint. We use raw fetch + URLSearchParams
 * rather than an OData library to keep dependencies lean and predictable.
 *
 * The client is credential-gated: if MLS_BASE_URL or MLS_ACCESS_TOKEN is
 * missing, every method throws `MlsNotConfiguredError`. Callers should
 * catch and degrade gracefully (the cron skips, the health endpoint
 * reports `configured: false`).
 */
export class MlsNotConfiguredError extends Error {
  constructor() {
    super("MLS is not configured: set MLS_BASE_URL and MLS_ACCESS_TOKEN");
    this.name = "MlsNotConfiguredError";
  }
}

export type ResoProperty = {
  ListingKey: string;
  ListingId?: string;
  ListAgentMlsId?: string;
  ListAgentFullName?: string;
  ListAgentEmail?: string;
  ListAgentPreferredPhone?: string;
  ListOfficeName?: string;
  ListOfficeMlsId?: string;
  StandardStatus?: string;
  MlsStatus?: string;
  UnparsedAddress?: string;
  StreetNumber?: string;
  StreetName?: string;
  StreetSuffix?: string;
  City?: string;
  StateOrProvince?: string;
  PostalCode?: string;
  ListPrice?: number;
  BedroomsTotal?: number;
  BathroomsTotalInteger?: number;
  BathroomsTotalDecimal?: number;
  LivingArea?: number;
  LotSizeAcres?: number;
  YearBuilt?: number;
  PublicRemarks?: string;
  ModificationTimestamp?: string;
  ListingContractDate?: string;
};

export type ResoMedia = {
  MediaKey: string;
  ResourceRecordKey: string;
  MediaURL?: string;
  Order?: number;
  ShortDescription?: string;
  ImageWidth?: number;
  ImageHeight?: number;
};

type ODataPage<T> = {
  "@odata.context"?: string;
  "@odata.count"?: number;
  "@odata.nextLink"?: string;
  value: T[];
};

export class MlsClient {
  private cfg: MlsConfig;

  constructor(cfg?: MlsConfig) {
    this.cfg = cfg ?? getMlsConfig();
  }

  isConfigured(): boolean {
    return this.cfg.configured;
  }

  private requireConfig(): { baseUrl: string; accessToken: string } {
    if (!this.cfg.configured || !this.cfg.baseUrl || !this.cfg.accessToken) {
      throw new MlsNotConfiguredError();
    }
    return { baseUrl: this.cfg.baseUrl, accessToken: this.cfg.accessToken };
  }

  private async odataGet<T>(url: string): Promise<ODataPage<T>> {
    const { accessToken } = this.requireConfig();
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new Error(`RESO request failed: ${resp.status} ${resp.statusText} — ${body.slice(0, 500)}`);
    }
    return (await resp.json()) as ODataPage<T>;
  }

  private buildUrl(resource: string, params: Record<string, string>): string {
    const { baseUrl } = this.requireConfig();
    const url = new URL(`${baseUrl.replace(/\/$/, "")}/${resource}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
    return url.toString();
  }

  /**
   * Iterate all properties matching the given filter, following @odata.nextLink.
   * The MLS feed is the single configured board; no multi-source fan-out.
   */
  async *iterateProperties(opts: {
    filter?: string;
    select?: string[];
    top?: number;
  } = {}): AsyncGenerator<ResoProperty[]> {
    const { propertyResource } = this.cfg;
    const params: Record<string, string> = {
      $top: String(opts.top ?? 200),
      $orderby: "ModificationTimestamp asc",
    };
    if (opts.filter) params.$filter = opts.filter;
    if (opts.select?.length) params.$select = opts.select.join(",");

    let url: string | null = this.buildUrl(propertyResource, params);
    while (url) {
      const page = await this.odataGet<ResoProperty>(url);
      if (page.value.length > 0) yield page.value;
      url = page["@odata.nextLink"] ?? null;
    }
  }

  async fetchMediaForListing(listingKey: string): Promise<ResoMedia[]> {
    const { mediaResource, maxPhotosPerListing } = this.cfg;
    const params: Record<string, string> = {
      $filter: `ResourceRecordKey eq '${listingKey.replace(/'/g, "''")}' and ResourceName eq 'Property'`,
      $orderby: "Order asc",
      $top: String(maxPhotosPerListing),
    };
    const url = this.buildUrl(mediaResource, params);
    const page = await this.odataGet<ResoMedia>(url);
    return page.value;
  }
}

export const mlsClient = new MlsClient();

export function logMlsStatus(): void {
  const cfg = getMlsConfig();
  if (cfg.configured) {
    logger.info(
      { boardId: cfg.boardId, baseUrl: cfg.baseUrl, deltaIntervalMs: cfg.deltaIntervalMs },
      "MLS client configured",
    );
  } else {
    logger.warn(
      "MLS ingestion is disabled — set MLS_BASE_URL, MLS_ACCESS_TOKEN, and MLS_BOARD_ID to enable.",
    );
  }
}
