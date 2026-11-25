import { useCallback } from "react";
import { Link } from "react-router";
import * as api from "../api/endpoints";
import { Icon, VerifiedMark } from "../components/Icon";
import { Marketplace } from "../components/Marketplace";
import { ProductThumb } from "../components/ProductThumb";
import { SERVICE_AREA } from "../config";
import { naira } from "../lib/format";
import { useApi } from "../lib/useApi";
import { useReveal } from "../lib/useReveal";

/** Curved rows from the logo's woven field, drawn across the hero. */
function FieldRows() {
  return (
    <svg className="hero__rows" viewBox="0 0 1440 360" preserveAspectRatio="none" aria-hidden="true">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <path
          key={i}
          d={`M-40 ${150 + i * 42} Q720 ${70 + i * 42} 1480 ${150 + i * 42}`}
          style={{ animationDelay: `${i * -2.4}s` }}
        />
      ))}
    </svg>
  );
}

/** The newest real listings, shown beside the headline. */
function LiveMarketCard() {
  const load = useCallback(() => api.listProducts(), []);
  const { data } = useApi(load);
  const latest = data?.slice(0, 3) ?? [];

  return (
    <aside className="live-card" aria-label="Newest listings">
      <div className="live-card__head">
        <span className="live-card__pulse" aria-hidden="true" />
        Fresh on the market
      </div>
      {latest.length === 0 ? (
        <p className="live-card__empty">New harvests from verified farms appear here as they're listed.</p>
      ) : (
        <ul className="live-card__list">
          {latest.map((product) => (
            <li key={product.id}>
              <Link to={`/products/${product.id}`} className="live-card__row">
                <ProductThumb name={product.name} imageUrl={product.image_url} className="live-card__thumb" />
                <span className="live-card__main">
                  <span className="live-card__name">{product.name}</span>
                  <span className="live-card__farm">
                    <VerifiedMark size={12} onDark /> {product.farm_name ?? "Verified farm"}
                  </span>
                </span>
                <span className="live-card__price">
                  {naira(product.price_per_unit)}
                  <span>/ {product.unit}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link to="/shop" className="live-card__link">
        Browse the marketplace <Icon name="arrowRight" size={16} />
      </Link>
    </aside>
  );
}

const PROMISES = [
  {
    icon: "shield" as const,
    title: "Verified farms only",
    body: "Our team reviews every farm before it can sell, and checks again if its details change.",
  },
  {
    icon: "tag" as const,
    title: "Prices set by farmers",
    body: "Farmers list their own prices, so more of what you pay goes to the people who grew it.",
  },
  {
    icon: "receipt" as const,
    title: "Follow every order",
    body: "See when each farm accepts your order and when it's ready, then confirm when it arrives.",
  },
];

const FAQS = [
  {
    q: "Where is FieldBasket available?",
    a: `FieldBasket connects buyers and verified farms across ${SERVICE_AREA}.`,
  },
  {
    q: "How do I know a farm is real?",
    a: "Every farm is reviewed by our team, including a phone call, before it can sell. Verified farms show a green check next to their name.",
  },
  {
    q: "Can I order from more than one farm at once?",
    a: "Yes. Add produce from any farms to one basket and check out once. Each farm receives and confirms its own part of your order, and you can follow each one under Orders.",
  },
  {
    q: "How do I pay, and how does delivery work?",
    a: "You pay online at checkout with Paystack or Interswitch (card, transfer or USSD). Choose your delivery area and its fee is added to your total. We bring your order to your door once the farms have it ready.",
  },
  {
    q: "What if a farm can't supply something?",
    a: "You only pay for what you get. If a farm declines an item, or you cancel before it's accepted, that item is refunded to you, and the delivery fee too if nothing else in the order goes ahead.",
  },
  {
    q: "Do I need to download an app?",
    a: "No. FieldBasket works in your phone's browser. You can add it to your home screen and open it like any other app, even on a weak connection.",
  },
  {
    q: "How do I start selling?",
    a: "Create a farmer account, add your farm details and send them for verification. Once you're approved, you can list produce straight away.",
  },
];

export default function Home() {
  const reveal = useReveal<HTMLElement>();
  const revealHow = useReveal<HTMLElement>();
  const revealFarmers = useReveal<HTMLElement>();
  const revealTrust = useReveal<HTMLElement>();
  const revealFaq = useReveal<HTMLElement>();

  return (
    <>
      <section className="hero">
        <FieldRows />
        <div className="hero__inner">
          <div className="hero__copy">
            <span className="hero__place">
              <span className="dot dot--lime" aria-hidden="true" /> Across {SERVICE_AREA}
            </span>
            <h1 className="hero__title">Fresh food, straight from Ekiti farmers.</h1>
            <p className="hero__lead">
              FieldBasket connects households, traders and kitchens with farms our team has checked, so you always
              know who grew your food and what they charge for it.
            </p>
            <div className="hero__actions">
              <Link to="/#market" className="btn btn--lime btn--lg">
                Start shopping
              </Link>
              <Link to="/register?role=farmer" className="btn btn--ghost-dark btn--lg">
                Sell your harvest
              </Link>
            </div>
            <p className="hero__note">No download needed. Add it to your phone's home screen and it opens like an app.</p>
          </div>
          <LiveMarketCard />
        </div>
      </section>

      <section className="promises" aria-label="Our promise">
        <div className="container promises__grid">
          {PROMISES.map((promise) => (
            <div key={promise.title} className="promise">
              <span className="promise__icon">
                <Icon name={promise.icon} size={22} />
              </span>
              <span>
                <span className="promise__title">{promise.title}</span>
                <span className="promise__body">{promise.body}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section id="market" ref={reveal} className="section-block reveal">
        <div className="container">
          <header className="section-head">
            <span className="eyebrow">Marketplace</span>
            <h2 className="display-2">Fresh this week</h2>
            <p className="section-head__lead">Live listings from verified farms. Browse freely; sign in when you're ready to order.</p>
          </header>
          <Marketplace limit={8} showAllLink />
        </div>
      </section>

      <section id="how" ref={revealHow} className="section-block section-block--tint reveal">
        <div className="container">
          <header className="section-head">
            <span className="eyebrow">For buyers</span>
            <h2 className="display-2">Order from the farm in three steps.</h2>
          </header>
          <ol className="steps">
            <li>
              <span className="steps__num">01</span>
              <span className="steps__title">Browse what's fresh</span>
              <span className="steps__body">See produce from verified farms, with the farm's name, town and price on every listing.</span>
            </li>
            <li>
              <span className="steps__num">02</span>
              <span className="steps__title">Fill your basket</span>
              <span className="steps__body">Add what you need from one farm or several, then pay once, securely, with delivery to your area.</span>
            </li>
            <li>
              <span className="steps__num">03</span>
              <span className="steps__title">Follow it to your door</span>
              <span className="steps__body">Each farm confirms its part. Watch it move from accepted to ready and confirm when it arrives.</span>
            </li>
          </ol>
        </div>
      </section>

      <section id="farmers" ref={revealFarmers} className="farmers reveal">
        <div className="container farmers__inner">
          <div className="farmers__copy">
            <span className="eyebrow eyebrow--lime">For farmers</span>
            <h2 className="display-2">Sell your harvest without the middleman.</h2>
            <p className="farmers__lead">Reach buyers across {SERVICE_AREA} directly, set your own prices and decide which orders to take.</p>
            <ul className="check-list">
              <li><Icon name="check" size={20} strokeWidth={2} /> List produce in minutes, with photos from your phone</li>
              <li><Icon name="check" size={20} strokeWidth={2} /> Accept the orders that suit you, decline others with a reason</li>
              <li><Icon name="check" size={20} strokeWidth={2} /> See this week's sales and which produce is running low</li>
            </ul>
            <Link to="/register?role=farmer" className="btn btn--lime btn--lg">
              Register your farm
            </Link>
          </div>
          <div className="farmers__preview" aria-hidden="true">
            <div className="preview-card">
              <span className="preview-card__row preview-card__muted">
                Your farm <span className="preview-card__lime">Verified seller</span>
              </span>
              <span className="preview-card__label">Sales this week</span>
              <span className="preview-card__figure">₦48,500</span>
              <span className="preview-card__metrics">
                <span><b>2</b>New orders</span>
                <span><b>6</b>Live listings</span>
                <span><b className="amber">1</b>Running low</span>
              </span>
              <span className="preview-card__order">
                <span className="preview-card__row"><b>Tomatoes · 10 kg</b><b>₦18,000</b></span>
                <span className="preview-card__small">Restaurant order</span>
                <span className="preview-card__buttons"><span>Decline</span><span>Accept</span></span>
              </span>
            </div>
            <span className="preview-card__caption">Example of the farmer overview</span>
          </div>
        </div>
      </section>

      <section id="trust" ref={revealTrust} className="section-block reveal">
        <div className="container trust">
          <header className="section-head trust__head">
            <span className="eyebrow">How we verify</span>
            <h2 className="display-2">A real farm behind every listing.</h2>
            <p className="section-head__lead">
              Buying from someone you've never met takes trust. That's why no farm can sell on FieldBasket until our team has checked it.
            </p>
          </header>
          <ol className="verify">
            <li>
              <span className="verify__num">1</span>
              <span><b>The farmer applies</b>They share the farm's name, town, address and a phone number.</span>
            </li>
            <li>
              <span className="verify__num">2</span>
              <span><b>Our team checks the details</b>We review the application and call the farmer before deciding.</span>
            </li>
            <li>
              <span className="verify__num">3</span>
              <span><b>Approved farms get the verified mark</b>Only then can they list produce. If a farm changes its details later, we check it again.</span>
            </li>
          </ol>
        </div>
      </section>

      <section id="faq" ref={revealFaq} className="section-block section-block--white reveal">
        <div className="container container--narrow">
          <h2 className="display-2">Questions</h2>
          <div className="faq">
            {FAQS.map((item) => (
              <details key={item.q}>
                <summary>
                  {item.q}
                  <span className="faq__icon" aria-hidden="true" />
                </summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="container cta-band-wrap">
        <div className="cta-band">
          <div>
            <h2 className="display-3">See what's fresh this week.</h2>
            <p>Browse without signing up. Create an account when you're ready to order.</p>
          </div>
          <div className="cta-band__actions">
            <Link to="/shop" className="btn btn--ink btn--lg">Start shopping</Link>
            <Link to="/register?role=farmer" className="btn btn--outline-ink btn--lg">Register your farm</Link>
          </div>
        </div>
      </section>
    </>
  );
}
