import { logger } from "../logger.js";
import { ObjectStorageService } from "../objectStorage.js";

const objectStorage = new ObjectStorageService();

/**
 * Download a remote MLS photo URL and store it in Object Storage so the
 * site renderer can serve it from our domain (avoiding raw MLS CDN URLs
 * in the browser and surviving URL churn).
 *
 * Returns the canonical `/objects/<entityId>` path on success, or `null`
 * if either the download or upload fails. Failures are logged and swallowed
 * — callers must not crash on a single bad photo.
 */
export async function downloadAndStorePhoto(sourceUrl: string): Promise<string | null> {
  try {
    const resp = await fetch(sourceUrl, { signal: AbortSignal.timeout(30_000) });
    if (!resp.ok) {
      logger.warn({ sourceUrl, status: resp.status }, "Photo download failed");
      return null;
    }
    const contentType = resp.headers.get("content-type") || "application/octet-stream";
    const buf = Buffer.from(await resp.arrayBuffer());
    const uploadUrl = await objectStorage.getObjectEntityUploadURL();
    const put = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: buf,
      signal: AbortSignal.timeout(60_000),
    });
    if (!put.ok) {
      logger.warn({ sourceUrl, status: put.status }, "Photo upload to Object Storage failed");
      return null;
    }
    return objectStorage.normalizeObjectEntityPath(uploadUrl.split("?")[0]);
  } catch (err) {
    logger.warn({ err, sourceUrl }, "Photo download/upload errored");
    return null;
  }
}
