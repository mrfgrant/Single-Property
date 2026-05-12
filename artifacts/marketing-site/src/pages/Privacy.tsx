import { Nav } from "@/components/sections/Nav";
import { Footer } from "@/components/sections/Footer";

export default function Privacy() {
  return (
    <div className="min-h-[100dvh] bg-warm-white flex flex-col font-sans">
      <Nav />
      <main className="flex-1 max-w-3xl mx-auto px-6 py-16 w-full">
        <h1 className="text-3xl font-bold text-ink mb-2">Privacy Policy</h1>
        <p className="text-xs text-muted font-mono mb-10">Last updated: May 2026</p>

        <section className="prose prose-sm max-w-none text-ink/80 space-y-8">

          <div>
            <h2 className="text-lg font-semibold text-ink mb-2">1. Information We Collect</h2>
            <p>
              When you sign up for PropSite or use our platform, we collect information you provide directly,
              such as your name, email address, brokerage name, and MLS credentials. We also collect usage
              data automatically, including pages visited, features used, and device/browser information.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-ink mb-2">2. How We Use Your Information</h2>
            <p>We use the information we collect to:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Operate and improve the PropSite platform</li>
              <li>Generate and publish property listing pages on your behalf</li>
              <li>Send transactional emails and product updates</li>
              <li>Respond to support requests</li>
              <li>Analyze usage to improve our service</li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-ink mb-2">3. Cookies</h2>
            <p>
              PropSite uses cookies and similar technologies to maintain your session, remember your
              preferences, and gather analytics data. You can disable cookies in your browser settings,
              though some parts of the platform may not function correctly without them.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-ink mb-2">4. Data Sharing</h2>
            <p>
              We do not sell your personal information. We may share data with trusted third-party service
              providers (such as email delivery and analytics platforms) solely to operate the platform.
              We may also disclose information if required by law or to protect the rights, property, or
              safety of PropSite, our users, or others.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-ink mb-2">5. Data Retention</h2>
            <p>
              We retain your information for as long as your account is active or as needed to provide
              services. You may request deletion of your account and associated data at any time by
              contacting us at <a href="mailto:support@mail.propsite.io" className="text-gold hover:underline">support@mail.propsite.io</a>.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-ink mb-2">6. Security</h2>
            <p>
              We implement industry-standard security measures to protect your data. However, no method
              of transmission over the Internet or electronic storage is 100% secure. We encourage you to
              use a strong, unique password for your account.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-ink mb-2">7. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of material changes
              via email or a notice on the platform. Continued use of PropSite after changes take effect
              constitutes your acceptance of the updated policy.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-ink mb-2">8. Contact</h2>
            <p>
              Questions about this policy? Reach us at{" "}
              <a href="mailto:support@mail.propsite.io" className="text-gold hover:underline">
                support@mail.propsite.io
              </a>.
            </p>
          </div>

        </section>
      </main>
      <Footer />
    </div>
  );
}
