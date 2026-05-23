/**
 * Virtual tour and video URL detection utilities.
 *
 * The MLS media feed mixes real photos with links to Matterport tours,
 * Zillow 3D walkthroughs, iGUIDE interactive floorplans, Kuula 360°
 * photos, YouTube walkthroughs, and Vimeo showcase videos. None of these
 * are images and all are currently discarded by downloadAndStorePhoto().
 *
 * These utilities detect provider-specific URLs, classify them as "tour"
 * or "video", and build the correct embed URL for each provider.
 */

export type TourKind = "tour" | "video";

export interface DetectedMedia {
  url: string;
  provider: string;
  embedUrl: string;
  kind: TourKind;
}

// ---------------------------------------------------------------------------
// Virtual tour providers (Matterport, Zillow 3D, iGUIDE, Kuula)
// ---------------------------------------------------------------------------

/**
 * Detect Matterport virtual tours.
 * Canonical URL forms:
 *   https://my.matterport.com/show/?m=<id>
 *   https://matterport.com/...
 *   https://<custom-sub>.matterport.com/show/?m=<id>
 */
function detectMatterport(url: string): DetectedMedia | null {
  if (!/matterport\.com/i.test(url)) return null;
  const match = url.match(/[?&]m=([A-Za-z0-9]+)/);
  const id = match?.[1];
  const embedUrl = id
    ? `https://my.matterport.com/show/?m=${id}&play=1`
    : url; // fallback: embed the original URL directly
  return { url, provider: "matterport", embedUrl, kind: "tour" };
}

/**
 * Detect Zillow 3D Home tours.
 * URL forms:
 *   https://www.zillow.com/homedetails/.../3d-tour/
 *   https://www.zillow.com/view-imx/<id>/...
 *   https://zillow.com/3dhome/<id>
 */
function detectZillow3D(url: string): DetectedMedia | null {
  if (!/zillow\.com/i.test(url)) return null;
  if (!/3d|imx|3dhome/i.test(url)) return null;
  // Zillow 3D embeds use the same URL; no special transformation needed.
  return { url, provider: "zillow3d", embedUrl: url, kind: "tour" };
}

/**
 * Detect iGUIDE interactive floorplan tours.
 * URL forms:
 *   https://iguide.tours/<id>
 *   https://<id>.iguide.tours/
 *   https://app.iguide.tours/...
 */
function detectIguide(url: string): DetectedMedia | null {
  if (!/iguide\.tours/i.test(url)) return null;
  return { url, provider: "iguide", embedUrl: url, kind: "tour" };
}

/**
 * Detect Kuula 360° virtual tours.
 * URL forms:
 *   https://kuula.co/share/<id>
 *   https://kuula.co/post/<id>
 *   https://kuula.co/tour/<id>
 */
function detectKuula(url: string): DetectedMedia | null {
  if (!/kuula\.co/i.test(url)) return null;
  // Convert /post/ and /tour/ to /share/ for embed compatibility.
  const embedUrl = url.replace(/\/(post|tour)\//i, "/share/");
  return { url, provider: "kuula", embedUrl, kind: "tour" };
}

// ---------------------------------------------------------------------------
// Video providers (YouTube, Vimeo)
// ---------------------------------------------------------------------------

/**
 * Detect YouTube video URLs and build the standard embed URL.
 * URL forms:
 *   https://www.youtube.com/watch?v=<id>
 *   https://youtu.be/<id>
 *   https://youtube.com/embed/<id>
 *   https://www.youtube.com/shorts/<id>
 */
function detectYouTube(url: string): DetectedMedia | null {
  if (!/youtube\.com|youtu\.be/i.test(url)) return null;

  let id: string | null = null;

  // youtu.be/<id>
  const shortMatch = url.match(/youtu\.be\/([A-Za-z0-9_-]{11})/);
  if (shortMatch) id = shortMatch[1];

  // youtube.com/watch?v=<id>
  if (!id) {
    const watchMatch = url.match(/[?&]v=([A-Za-z0-9_-]{11})/);
    if (watchMatch) id = watchMatch[1];
  }

  // youtube.com/embed/<id> or /shorts/<id>
  if (!id) {
    const pathMatch = url.match(/\/(?:embed|shorts|v)\/([A-Za-z0-9_-]{11})/);
    if (pathMatch) id = pathMatch[1];
  }

  if (!id) return null;
  const embedUrl = `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1`;
  return { url, provider: "youtube", embedUrl, kind: "video" };
}

/**
 * Detect Vimeo video URLs and build the standard embed URL.
 * URL forms:
 *   https://vimeo.com/<id>
 *   https://player.vimeo.com/video/<id>
 *   https://vimeo.com/showcase/<id>/video/<id>
 */
function detectVimeo(url: string): DetectedMedia | null {
  if (!/vimeo\.com/i.test(url)) return null;

  let id: string | null = null;

  // player.vimeo.com/video/<id>
  const playerMatch = url.match(/player\.vimeo\.com\/video\/(\d+)/);
  if (playerMatch) id = playerMatch[1];

  // vimeo.com/<numeric-id>  (may have trailing /hash or ?params)
  if (!id) {
    const directMatch = url.match(/vimeo\.com\/(\d+)/);
    if (directMatch) id = directMatch[1];
  }

  if (!id) return null;
  const embedUrl = `https://player.vimeo.com/video/${id}?dnt=1`;
  return { url, provider: "vimeo", embedUrl, kind: "video" };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const TOUR_DETECTORS = [detectMatterport, detectZillow3D, detectIguide, detectKuula];
const VIDEO_DETECTORS = [detectYouTube, detectVimeo];

/**
 * Try to detect a virtual tour URL (Matterport, Zillow 3D, iGUIDE, Kuula).
 * Returns null when the URL is not a recognised tour provider.
 */
export function detectVirtualTour(url: string): DetectedMedia | null {
  for (const detect of TOUR_DETECTORS) {
    const result = detect(url);
    if (result) return result;
  }
  return null;
}

/**
 * Try to detect a video embed URL (YouTube, Vimeo).
 * Returns null when the URL is not a recognised video provider.
 */
export function detectVideoEmbed(url: string): DetectedMedia | null {
  for (const detect of VIDEO_DETECTORS) {
    const result = detect(url);
    if (result) return result;
  }
  return null;
}

/**
 * Try to classify a URL as either a virtual tour or a video embed.
 * Checks tours first, then videos.
 * Returns null when the URL matches neither.
 */
export function detectTourOrVideo(url: string): DetectedMedia | null {
  return detectVirtualTour(url) ?? detectVideoEmbed(url) ?? null;
}
