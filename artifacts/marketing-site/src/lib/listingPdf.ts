import type { SampleListing } from "@/data/sampleListings";
import { formatPrice } from "@/data/sampleListings";

type ListingForPdf = SampleListing & {
  agentPhone?: string;
  agentEmail?: string;
  agentPhotoUrl?: string;
  photoUrls?: string[];
  domainName?: string;
};

const BRAND_INK = "#0a1e3a";
const BRAND_GOLD = "#b08d57";
const BRAND_CREAM = "#f5efe6";

function safeFilename(input: string): string {
  return input.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "listing";
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Render the listing URL as a PNG data URL. High error correction (H) so a
 * printed QR remains scannable when the rider gets weather-beaten on a sign.
 * Dynamic import keeps qrcode out of the initial listing-page bundle.
 */
export async function generateQrDataUrl(url: string, sizePx = 1024): Promise<string> {
  const QRCode = (await import("qrcode")).default;
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: "H",
    margin: 1,
    width: sizePx,
    color: { dark: "#0a1e3a", light: "#ffffff" },
  });
}

export async function downloadQrPng(listing: ListingForPdf, url: string): Promise<void> {
  const dataUrl = await generateQrDataUrl(url, 1024);
  const blob = await (await fetch(dataUrl)).blob();
  triggerDownload(blob, `${safeFilename(listing.address)}-qr.png`);
}

/**
 * Convert a remote image URL to a data URL via canvas. Returns null if the
 * image can't be fetched or is CORS-blocked — callers fall back to a
 * photo-less layout in that case.
 */
async function imageToDataUrl(src: string): Promise<{ dataUrl: string; w: number; h: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0);
        resolve({
          dataUrl: canvas.toDataURL("image/jpeg", 0.85),
          w: img.naturalWidth,
          h: img.naturalHeight,
        });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * Real estate sign rider — 6"×24" landscape, the standard MLS rider size
 * that bolts onto the bottom of a yard sign. Big QR on the right, address
 * + agent on the left. Auto-generated from MLS data, no agent input.
 */
export async function generateSignRiderPdf(listing: ListingForPdf, url: string): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "in", format: [24, 6] });
  const W = 24;
  const H = 6;

  doc.setFillColor(BRAND_CREAM);
  doc.rect(0, 0, W, H, "F");

  // Gold accent stripe at the top
  doc.setFillColor(BRAND_GOLD);
  doc.rect(0, 0, W, 0.3, "F");

  // QR block on the right
  const qrSize = 5;
  const qrX = W - qrSize - 0.5;
  const qrY = (H - qrSize) / 2;
  doc.setFillColor("#ffffff");
  doc.rect(qrX - 0.15, qrY - 0.15, qrSize + 0.3, qrSize + 0.3, "F");
  const qrDataUrl = await generateQrDataUrl(url, 1200);
  doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);

  // "SCAN ME" label under QR
  doc.setTextColor(BRAND_INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("SCAN FOR PHOTOS, PRICE & TOUR", qrX + qrSize / 2, qrY + qrSize + 0.35, { align: "center" });

  // Left text block — bounded so long MLS addresses can't overflow into the QR
  const leftX = 0.7;
  const textMaxWidth = qrX - leftX - 0.4;
  let cursorY = 1.3;

  // Auto-shrink helper: drop font size until text fits within textMaxWidth.
  const fitFontSize = (text: string, font: [string, string], startSize: number, minSize = 14) => {
    doc.setFont(...font);
    let size = startSize;
    while (size > minSize && doc.getStringUnitWidth(text) * size * 0.0139 > textMaxWidth) {
      size -= 1;
    }
    doc.setFontSize(size);
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(BRAND_GOLD);
  doc.text("FOR SALE", leftX, cursorY);
  cursorY += 0.5;

  doc.setTextColor(BRAND_INK);
  const addressText = listing.address.toUpperCase();
  fitFontSize(addressText, ["times", "normal"], 38, 22);
  doc.text(addressText, leftX, cursorY);
  cursorY += 0.55;

  const cityText = `${listing.city}, ${listing.state} ${listing.zip}`.toUpperCase();
  fitFontSize(cityText, ["times", "normal"], 20, 14);
  doc.setTextColor("#555555");
  doc.text(cityText, leftX, cursorY);
  cursorY += 0.6;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.setTextColor(BRAND_INK);
  doc.text(formatPrice(listing.price), leftX, cursorY);
  cursorY += 0.45;

  const specsText = `${listing.beds} BED  ·  ${listing.baths} BATH  ·  ${listing.sqft.toLocaleString()} SQ FT`;
  fitFontSize(specsText, ["helvetica", "normal"], 14, 10);
  doc.setTextColor("#666666");
  doc.text(specsText, leftX, cursorY);
  cursorY += 0.5;

  // Agent block at the bottom-left
  if (listing.agentName) {
    const agentText = listing.agentName.toUpperCase();
    fitFontSize(agentText, ["helvetica", "bold"], 13, 10);
    doc.setTextColor(BRAND_INK);
    doc.text(agentText, leftX, cursorY);
    cursorY += 0.25;
    if (listing.agentPhone) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(12);
      doc.setTextColor("#444444");
      doc.text(listing.agentPhone, leftX, cursorY);
    }
  }

  // PropSite watermark bottom-right
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor("#999999");
  doc.text("Auto-built by PROPSITE.io", W - 0.4, H - 0.2, { align: "right" });

  doc.save(`${safeFilename(listing.address)}-sign-rider.pdf`);
}

/**
 * One-page property flyer — US Letter portrait. Hero photo + price + specs
 * + agent contact + QR + PropSite branding. Print-ready, no agent input.
 */
export async function generateFlyerPdf(listing: ListingForPdf, url: string): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "in", format: "letter" });
  const W = 8.5;
  const H = 11;
  const margin = 0.5;

  doc.setFillColor("#ffffff");
  doc.rect(0, 0, W, H, "F");

  // Hero photo (best-effort — falls back to a colored block if CORS-blocked)
  const heroSrc = listing.photoUrls?.[0];
  const photoY = margin;
  const photoH = 4.2;
  if (heroSrc) {
    const img = await imageToDataUrl(heroSrc);
    if (img) {
      doc.addImage(img.dataUrl, "JPEG", margin, photoY, W - margin * 2, photoH);
    } else {
      doc.setFillColor(BRAND_INK);
      doc.rect(margin, photoY, W - margin * 2, photoH, "F");
    }
  } else {
    doc.setFillColor(BRAND_INK);
    doc.rect(margin, photoY, W - margin * 2, photoH, "F");
  }

  // Gold price banner overlay
  doc.setFillColor(BRAND_GOLD);
  doc.rect(margin, photoY + photoH - 0.6, 3.2, 0.6, "F");
  doc.setTextColor("#ffffff");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text(formatPrice(listing.price), margin + 0.2, photoY + photoH - 0.18);

  // Address block
  let cursorY = photoY + photoH + 0.5;
  doc.setTextColor(BRAND_INK);
  doc.setFont("times", "normal");
  doc.setFontSize(24);
  doc.text(listing.address, margin, cursorY);
  cursorY += 0.3;
  doc.setFontSize(12);
  doc.setTextColor("#666666");
  doc.text(`${listing.city}, ${listing.state} ${listing.zip}`, margin, cursorY);
  cursorY += 0.45;

  // Specs row
  doc.setDrawColor(BRAND_GOLD);
  doc.setLineWidth(0.02);
  doc.line(margin, cursorY, W - margin, cursorY);
  cursorY += 0.35;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(BRAND_INK);
  const specs = [
    `${listing.beds} BEDROOMS`,
    `${listing.baths} BATHS`,
    `${listing.sqft.toLocaleString()} SQ FT`,
    listing.lotAcres ? `${listing.lotAcres} ACRES` : null,
  ].filter(Boolean) as string[];
  const specSpan = (W - margin * 2) / specs.length;
  specs.forEach((s, i) => {
    doc.text(s, margin + specSpan * i + specSpan / 2, cursorY, { align: "center" });
  });
  cursorY += 0.2;
  doc.line(margin, cursorY, W - margin, cursorY);
  cursorY += 0.45;

  // Description (truncated)
  if (listing.description) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor("#333333");
    const desc = listing.description.length > 600
      ? listing.description.slice(0, 597) + "…"
      : listing.description;
    const lines = doc.splitTextToSize(desc, W - margin * 2 - 2.5);
    doc.text(lines, margin, cursorY);
  }

  // QR + scan-me block on the right
  const qrSize = 2.2;
  const qrX = W - margin - qrSize;
  const qrY = cursorY - 0.1;
  const qrDataUrl = await generateQrDataUrl(url, 1200);
  doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(BRAND_INK);
  doc.text("SCAN TO TOUR", qrX + qrSize / 2, qrY + qrSize + 0.22, { align: "center" });

  // Agent footer band
  const footerY = H - 1.4;
  doc.setFillColor(BRAND_INK);
  doc.rect(0, footerY, W, 1.4, "F");
  doc.setTextColor("#ffffff");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  if (listing.agentName) {
    doc.text(listing.agentName, margin, footerY + 0.4);
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor("#d8d8d8");
  if (listing.agentBrokerage) {
    doc.text(listing.agentBrokerage, margin, footerY + 0.62);
  }
  const contactLines: string[] = [];
  if (listing.agentPhone) contactLines.push(listing.agentPhone);
  if (listing.agentEmail) contactLines.push(listing.agentEmail);
  if (contactLines.length) {
    doc.text(contactLines.join("   ·   "), margin, footerY + 0.92);
  }

  doc.setFontSize(8);
  doc.setTextColor("#888888");
  doc.text("Auto-built by PROPSITE.io", W - margin, footerY + 1.2, { align: "right" });

  doc.save(`${safeFilename(listing.address)}-flyer.pdf`);
}
