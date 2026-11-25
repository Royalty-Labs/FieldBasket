import { useEffect, type ReactNode } from "react";
import { Link } from "react-router";
import { telLink, useSiteSettings } from "../settings/siteSettings";

/** Change this date whenever the wording below changes. */
const UPDATED = "25 November 2026";

function Contact() {
  const site = useSiteSettings();
  if (site.support_email) return <a href={`mailto:${site.support_email}`}>{site.support_email}</a>;
  if (site.support_phone) return <a href={telLink(site.support_phone)}>{site.support_phone}</a>;
  return <>the contact details at the foot of this page</>;
}

/** The business that runs FieldBasket, as set by an admin. */
function useOperator() {
  const site = useSiteSettings();
  return { operator: site.operator_name || "The FieldBasket team", area: site.service_area };
}

function LegalPage({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  useEffect(() => {
    document.title = `${title} · FieldBasket`;
    return () => {
      document.title = "FieldBasket";
    };
  }, [title]);
  return (
    <div className="container container--narrow page-pad">
      <article className="legal">
        <header className="legal__head">
          <span className="eyebrow">Last updated {UPDATED}</span>
          <h1 className="display-2">{title}</h1>
          <p className="legal__lead">{lead}</p>
        </header>
        {children}
      </article>
    </div>
  );
}

export function TermsPage() {
  const { operator, area } = useOperator();
  return (
    <LegalPage
      title="Terms of Use"
      lead={`These terms cover buying and selling on FieldBasket, a marketplace that connects buyers with verified farms across ${area}. By creating an account you agree to them.`}
    >
      <h2>1. Who we are</h2>
      <p>
        FieldBasket is operated by {operator} in Nigeria. We run the website, verify farms, take payment for orders and
        arrange delivery. Farms sell their own produce and set their own prices.
      </p>

      <h2>2. Your account</h2>
      <ul>
        <li>You must be at least 18, or use FieldBasket with a parent or guardian's permission.</li>
        <li>Give accurate details and keep your password private. You are responsible for activity on your account.</li>
        <li>We may suspend accounts that break these terms, give false information or put others at risk.</li>
      </ul>

      <h2>3. Buying</h2>
      <ul>
        <li>
          Prices and stock are confirmed when you check out. You pay for your whole basket, plus the delivery fee for your
          area, before the farms prepare it. Payments are handled by Paystack or Interswitch; FieldBasket never sees your
          card details.
        </li>
        <li>
          Each farm confirms its own items. If a farm declines an item, or you cancel before a farm accepts it, we refund
          that item. If nothing in your order goes ahead, we also refund the delivery fee.
        </li>
        <li>
          Refunds go back to the way you paid. Card and bank refunds usually appear within 5 to 10 working days, depending
          on your bank.
        </li>
        <li>
          If something arrives damaged, spoiled or different from the listing, contact us within 24 hours of delivery with
          a photo and we will work with the farm to put it right, which may include a refund.
        </li>
      </ul>

      <h2>4. Delivery</h2>
      <p>
        We deliver to the areas listed at checkout, for the fee shown there. Delivery times are estimates. Please give a
        working phone number and a clear address; if we can't reach you after reasonable attempts, we may not be able to
        refund perishable items.
      </p>

      <h2>5. Selling</h2>
      <ul>
        <li>
          Farms must pass our verification before they can list produce. Changing your farm's name, phone, town or address
          sends it back for a fresh check.
        </li>
        <li>
          List only produce you grow or have the right to sell, describe it honestly and keep stock up to date. Accept or
          decline orders promptly.
        </li>
        <li>You are responsible for the quality and safety of your produce and for following the law that applies to it.</li>
        <li>
          Payouts, and any commission or fees, are agreed with each farm in writing before it starts selling and may be
          updated with notice.
        </li>
      </ul>

      <h2>6. Things not to do</h2>
      <p>
        Don't misuse FieldBasket: no fake listings or orders, no attempts to take payments outside the platform for orders
        placed here, no harassment, and no attempts to break or overload the service.
      </p>

      <h2>7. Our responsibility</h2>
      <p>
        We work hard to keep FieldBasket accurate and available, but we can't promise it will always be uninterrupted. To
        the extent the law allows, our responsibility for any order is limited to the amount you paid for it. Nothing in
        these terms limits rights you have under Nigerian consumer protection law, including the Federal Competition and
        Consumer Protection Act.
      </p>

      <h2>8. Changes and contact</h2>
      <p>
        We may update these terms; we'll show the new date above and tell account holders about important changes. These
        terms are governed by the laws of the Federal Republic of Nigeria. Questions or complaints: <Contact />.
      </p>
      <p>
        See also our <Link to="/privacy">Privacy Policy</Link>.
      </p>
    </LegalPage>
  );
}

export function PrivacyPage() {
  const { operator } = useOperator();
  return (
    <LegalPage
      title="Privacy Policy"
      lead="How FieldBasket collects, uses and protects your personal data, in line with the Nigeria Data Protection Act 2023 and the NDPC's General Application and Implementation Directive."
    >
      <h2>1. Who is responsible</h2>
      <p>
        {operator}, which operates FieldBasket, is the data controller for the personal data described here. Contact us
        about your data at <Contact />.
      </p>

      <h2>2. What we collect</h2>
      <ul>
        <li><strong>Account details:</strong> your name, email address, account type and password (stored only as a secure hash).</li>
        <li><strong>Order details:</strong> what you order, your delivery area and address, phone number and any note you add.</li>
        <li><strong>Farm details</strong> (farmers only): farm name, phone, town, address, listings and photos.</li>
        <li>
          <strong>Payment details:</strong> the amount, reference and outcome of each payment. Your card or bank details
          are collected by Paystack or Interswitch, not by us.
        </li>
        <li><strong>Technical data:</strong> basic logs needed to keep the service secure and working.</li>
      </ul>

      <h2>3. Why we use it, and our lawful basis</h2>
      <ul>
        <li>To run your account and fulfil your orders: <em>performance of a contract</em> with you.</li>
        <li>To verify farms and keep the marketplace safe from fraud: our <em>legitimate interests</em>.</li>
        <li>To send order, payment and account emails, including password resets: <em>performance of a contract</em>.</li>
        <li>To keep financial records: <em>legal obligation</em>.</li>
      </ul>
      <p>We don't sell your personal data, and we don't send marketing messages without your consent.</p>

      <h2>4. Who we share it with</h2>
      <ul>
        <li>
          <strong>The farms you order from</strong> see your name, phone, delivery area and address and note, so they can
          prepare and deliver your order. Buyers see a farm's name and town.
        </li>
        <li><strong>Payment providers</strong> (Paystack, Interswitch) to process payments and refunds.</li>
        <li>
          <strong>Service providers</strong> who host our website and database, store photos (Cloudinary) and send emails,
          under contracts that require them to protect your data. Some of them store data outside Nigeria; where that
          happens we rely on the safeguards the NDPA requires.
        </li>
        <li><strong>Authorities</strong>, when the law requires it.</li>
      </ul>

      <h2>5. How long we keep it</h2>
      <p>
        We keep your account data while your account is open. Order and payment records are kept for up to six years for
        tax and accounting purposes, then deleted or anonymised. Logs are kept for a short period.
      </p>

      <h2>6. Your rights</h2>
      <p>Under the NDPA you can ask us to:</p>
      <ul>
        <li>give you a copy of your personal data, including in a portable format;</li>
        <li>correct data that is wrong or incomplete;</li>
        <li>delete your data, where we don't need to keep it by law;</li>
        <li>restrict or object to how we use it; and</li>
        <li>withdraw consent you've given, at any time.</li>
      </ul>
      <p>
        Email <Contact /> and we'll respond within 30 days. If you're not satisfied, you can complain to the Nigeria Data
        Protection Commission (ndpc.gov.ng).
      </p>

      <h2>7. Keeping it safe</h2>
      <p>
        We use encrypted connections, hashed passwords, limited staff access and providers with strong security. If a
        breach puts your rights at risk, we'll tell the NDPC within 72 hours and let you know without delay.
      </p>

      <h2>8. Cookies and storage</h2>
      <p>
        We don't use advertising or tracking cookies. Your browser stores your sign-in, basket and delivery details on your
        own device so the site works; you can clear them by signing out or clearing your browser data.
      </p>

      <h2>9. Children</h2>
      <p>FieldBasket is not meant for children under 18 without a parent or guardian.</p>

      <h2>10. Changes</h2>
      <p>
        We'll update the date above when this policy changes and tell account holders about important changes. See also
        our <Link to="/terms">Terms of Use</Link>.
      </p>
    </LegalPage>
  );
}
