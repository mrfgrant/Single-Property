import { useEffect } from "react";
import { Nav } from "@/components/sections/Nav";
import { Footer } from "@/components/sections/Footer";
import { Mail, Clock, BookOpen } from "lucide-react";
import { setPageSeo } from "@/lib/seo";

export default function Support() {
  useEffect(() => {
    setPageSeo({
      title: "Support — PropSite",
      description: "Get help with PropSite. Contact our team or find answers to common questions about listings, MLS sync, and billing.",
      path: "/support",
    });
  }, []);

  return (
    <div className="min-h-[100dvh] bg-warm-white flex flex-col font-sans">
      <Nav />
      <main className="flex-1 max-w-3xl mx-auto px-6 py-16 w-full">
        <h1 className="text-3xl font-bold text-ink mb-2">Support</h1>
        <p className="text-base text-muted font-light mb-12">
          We're here to help. Reach out and we'll get back to you as quickly as possible.
        </p>

        <div className="grid gap-6 md:grid-cols-3 mb-16">
          <div className="border border-border rounded-lg p-6 flex flex-col gap-3">
            <Mail className="h-5 w-5 text-gold" />
            <h2 className="font-semibold text-ink">Email Us</h2>
            <p className="text-sm text-muted font-light flex-1">
              Send us a message and we'll respond within one business day.
            </p>
            <a
              href="mailto:support@mail.propsite.io"
              className="text-sm text-gold font-medium hover:underline"
            >
              support@mail.propsite.io
            </a>
          </div>

          <div className="border border-border rounded-lg p-6 flex flex-col gap-3">
            <Clock className="h-5 w-5 text-gold" />
            <h2 className="font-semibold text-ink">Response Time</h2>
            <p className="text-sm text-muted font-light flex-1">
              Our support team operates Monday through Friday, 9 am – 6 pm Eastern.
              We aim to respond to all inquiries within one business day.
            </p>
          </div>

          <div className="border border-border rounded-lg p-6 flex flex-col gap-3">
            <BookOpen className="h-5 w-5 text-gold" />
            <h2 className="font-semibold text-ink">Common Questions</h2>
            <p className="text-sm text-muted font-light flex-1">
              Check the topics below for answers to frequently asked questions before
              reaching out.
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-xl font-semibold text-ink">Frequently Asked Questions</h2>

          <div className="border border-border rounded-lg divide-y divide-border">

            <details className="group p-5">
              <summary className="cursor-pointer font-medium text-ink list-none flex items-center justify-between">
                How do I connect my MLS account?
                <span className="text-gold group-open:rotate-180 transition-transform">↓</span>
              </summary>
              <p className="mt-3 text-sm text-muted font-light">
                During onboarding you'll be prompted to enter your MLS board credentials. PropSite
                uses them to sync your active listings automatically. You can update your credentials
                at any time from your profile settings.
              </p>
            </details>

            <details className="group p-5">
              <summary className="cursor-pointer font-medium text-ink list-none flex items-center justify-between">
                How quickly are listings published?
                <span className="text-gold group-open:rotate-180 transition-transform">↓</span>
              </summary>
              <p className="mt-3 text-sm text-muted font-light">
                Listings are typically published within a few minutes of a successful MLS sync.
                PropSite checks for new and updated listings on a regular schedule throughout the day.
              </p>
            </details>

            <details className="group p-5">
              <summary className="cursor-pointer font-medium text-ink list-none flex items-center justify-between">
                Can I customize my listing pages?
                <span className="text-gold group-open:rotate-180 transition-transform">↓</span>
              </summary>
              <p className="mt-3 text-sm text-muted font-light">
                Yes. Each listing page is branded to you automatically. Additional customization
                options — including custom domains and color themes — are available on paid plans.
              </p>
            </details>

            <details className="group p-5">
              <summary className="cursor-pointer font-medium text-ink list-none flex items-center justify-between">
                How do I cancel my subscription?
                <span className="text-gold group-open:rotate-180 transition-transform">↓</span>
              </summary>
              <p className="mt-3 text-sm text-muted font-light">
                You can cancel from your account settings at any time. Your access remains active
                through the end of your current billing period. Email us if you need help.
              </p>
            </details>

            <details className="group p-5">
              <summary className="cursor-pointer font-medium text-ink list-none flex items-center justify-between">
                I found a bug — how do I report it?
                <span className="text-gold group-open:rotate-180 transition-transform">↓</span>
              </summary>
              <p className="mt-3 text-sm text-muted font-light">
                Email{" "}
                <a href="mailto:support@mail.propsite.io" className="text-gold hover:underline">
                  support@mail.propsite.io
                </a>{" "}
                with a description of what happened and the steps to reproduce it. Screenshots or
                screen recordings are always helpful.
              </p>
            </details>

          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
