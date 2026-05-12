import { Nav } from "@/components/sections/Nav";
import { Footer } from "@/components/sections/Footer";

export default function Terms() {
  return (
    <div className="min-h-[100dvh] bg-warm-white flex flex-col font-sans">
      <Nav />
      <main className="flex-1 max-w-3xl mx-auto px-6 py-16 w-full">
        <h1 className="text-3xl font-bold text-ink mb-2">Terms of Service</h1>
        <p className="text-xs text-muted font-mono mb-10">Last updated: May 2026</p>

        <section className="prose prose-sm max-w-none text-ink/80 space-y-8">

          <div>
            <h2 className="text-lg font-semibold text-ink mb-2">1. Acceptance of Terms</h2>
            <p>
              By accessing or using PropSite ("Service"), you agree to be bound by these Terms of Service.
              If you do not agree, do not use the Service. These terms apply to all users, including
              real estate agents, brokers, and any other visitors.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-ink mb-2">2. Description of Service</h2>
            <p>
              PropSite is a real-estate SaaS platform that automatically generates branded property
              listing websites for real estate agents. Features include MLS data sync, lead capture,
              and cold-outreach tools. The Service is offered on a subscription basis.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-ink mb-2">3. Eligibility</h2>
            <p>
              You must be a licensed real estate professional or otherwise authorized to market real
              property in your jurisdiction to use PropSite's listing and outreach features. By using
              the Service you represent that you meet this requirement.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-ink mb-2">4. Account Responsibilities</h2>
            <p>
              You are responsible for maintaining the confidentiality of your account credentials and
              for all activity that occurs under your account. Notify us immediately at{" "}
              <a href="mailto:support@mail.propsite.io" className="text-gold hover:underline">
                support@mail.propsite.io
              </a>{" "}
              if you suspect unauthorized access.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-ink mb-2">5. MLS Data & Compliance</h2>
            <p>
              PropSite syncs listing data on your behalf using credentials you provide. You are solely
              responsible for ensuring your use of MLS data complies with your board's rules, IDX
              policies, and applicable law. PropSite does not independently verify MLS compliance and
              is not liable for violations arising from your use of the data.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-ink mb-2">6. Prohibited Uses</h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Use the Service for any unlawful purpose</li>
              <li>Send spam or unsolicited communications in violation of applicable law</li>
              <li>Attempt to gain unauthorized access to any portion of the platform</li>
              <li>Reverse-engineer or copy any part of the Service</li>
              <li>Upload harmful, infringing, or misleading content</li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-ink mb-2">7. Payments & Cancellation</h2>
            <p>
              Subscription fees are billed in advance on a monthly or annual basis. You may cancel at
              any time; your access continues until the end of your current billing period. Refunds are
              not provided for partial periods unless required by law.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-ink mb-2">8. Intellectual Property</h2>
            <p>
              PropSite and its original content, features, and functionality are owned by PropSite and
              are protected by copyright and other intellectual property laws. You retain ownership of
              content you upload (such as listing photos and descriptions) and grant PropSite a license
              to display that content as necessary to provide the Service.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-ink mb-2">9. Disclaimer of Warranties</h2>
            <p>
              The Service is provided "as is" without warranties of any kind, express or implied.
              PropSite does not warrant that the Service will be uninterrupted, error-free, or free
              of viruses or other harmful components.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-ink mb-2">10. Limitation of Liability</h2>
            <p>
              To the fullest extent permitted by law, PropSite shall not be liable for any indirect,
              incidental, special, or consequential damages arising out of your use of the Service,
              even if we have been advised of the possibility of such damages.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-ink mb-2">11. Changes to Terms</h2>
            <p>
              We may modify these Terms at any time. We will provide notice of material changes via
              email or an in-app notification. Your continued use of the Service after changes take
              effect constitutes acceptance of the updated Terms.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-ink mb-2">12. Contact</h2>
            <p>
              Questions about these Terms? Contact us at{" "}
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
