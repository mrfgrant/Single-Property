import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Download, QrCode, FileText, Printer } from "lucide-react";
import {
  downloadQrPng,
  generateSignRiderPdf,
  generateFlyerPdf,
} from "@/lib/listingPdf";
import type { SampleListing } from "@/data/sampleListings";

type ListingForShare = SampleListing & {
  agentPhone?: string;
  agentEmail?: string;
  agentPhotoUrl?: string;
  photoUrls?: string[];
  domainName?: string;
};

type Busy = "qr" | "rider" | "flyer" | null;

/**
 * "Share this home" section — QR preview + downloadable assets generated
 * automatically from the listing data. No agent input required: the same
 * data already on the page powers the printable rider and flyer.
 *
 * QR + PDFs are produced fully client-side (qrcode + jspdf) so this works
 * the same in preview mode and live mode without a server roundtrip.
 */
export default function ShareSection({
  listing,
  shareUrl,
}: {
  listing: ListingForShare;
  shareUrl: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, shareUrl, {
      errorCorrectionLevel: "H",
      margin: 1,
      width: 320,
      color: { dark: "#0a1e3a", light: "#ffffff" },
    }).catch(() => {
      /* canvas might not be mounted yet — silent */
    });
  }, [shareUrl]);

  async function run(action: Busy, fn: () => Promise<void>) {
    setBusy(action);
    setError(null);
    try {
      await fn();
    } catch (err) {
      console.error(err);
      setError("Couldn't generate the file. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      id="share"
      className="pl-24 md:pl-32 px-6 md:px-12 py-24 md:py-32 bg-warm-white border-t border-ink/5"
    >
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12 md:mb-16">
          <p className="text-[10px] uppercase tracking-[0.4em] text-gold mb-4">Share this home</p>
          <h2 className="font-serif text-3xl md:text-5xl text-ink leading-tight">
            Print, scan, share.
          </h2>
          <p className="text-ink/65 text-base md:text-lg mt-5 max-w-2xl mx-auto font-light">
            Every listing comes with a ready-to-print yard sign rider and one-page flyer —
            generated automatically from the MLS data, ready in seconds.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-10 md:gap-16 items-start">
          {/* QR preview card */}
          <div className="bg-cream p-6 flex flex-col items-center text-center">
            <canvas
              ref={canvasRef}
              className="w-full max-w-[240px] h-auto"
              aria-label="QR code that opens this listing"
            />
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted mt-5">
              Scan to view this home
            </p>
            <p className="text-xs text-ink/60 mt-2 break-all">{shareUrl.replace(/^https?:\/\//, "")}</p>
          </div>

          {/* Action stack */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => run("rider", () => generateSignRiderPdf(listing, shareUrl))}
              disabled={busy !== null}
              className="w-full flex items-center justify-between gap-4 p-5 bg-ink text-warm-white hover:bg-ink/90 disabled:opacity-60 transition-colors text-left"
            >
              <div className="flex items-center gap-4">
                <Printer size={20} className="text-gold shrink-0" />
                <div>
                  <p className="font-serif text-lg leading-tight">Sign rider PDF</p>
                  <p className="text-xs text-warm-white/60 mt-1">
                    6"×24" print-ready · fits a standard yard sign
                  </p>
                </div>
              </div>
              <span className="text-[10px] uppercase tracking-[0.2em] text-warm-white/70">
                {busy === "rider" ? "…" : "Download"}
              </span>
            </button>

            <button
              type="button"
              onClick={() => run("flyer", () => generateFlyerPdf(listing, shareUrl))}
              disabled={busy !== null}
              className="w-full flex items-center justify-between gap-4 p-5 border border-ink/20 hover:border-gold hover:bg-cream disabled:opacity-60 transition-colors text-left"
            >
              <div className="flex items-center gap-4">
                <FileText size={20} className="text-gold shrink-0" />
                <div>
                  <p className="font-serif text-lg leading-tight text-ink">One-page flyer PDF</p>
                  <p className="text-xs text-muted mt-1">
                    US Letter · photo, price, agent contact, QR
                  </p>
                </div>
              </div>
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted">
                {busy === "flyer" ? "…" : "Download"}
              </span>
            </button>

            <button
              type="button"
              onClick={() => run("qr", () => downloadQrPng(listing, shareUrl))}
              disabled={busy !== null}
              className="w-full flex items-center justify-between gap-4 p-5 border border-ink/20 hover:border-gold hover:bg-cream disabled:opacity-60 transition-colors text-left"
            >
              <div className="flex items-center gap-4">
                <QrCode size={20} className="text-gold shrink-0" />
                <div>
                  <p className="font-serif text-lg leading-tight text-ink">QR code (PNG)</p>
                  <p className="text-xs text-muted mt-1">
                    1024px white-background PNG for any sign or flyer
                  </p>
                </div>
              </div>
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted">
                {busy === "qr" ? "…" : <Download size={14} className="inline" />}
              </span>
            </button>

            {error && (
              <p className="text-xs text-red-700 mt-2" role="alert">
                {error}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
