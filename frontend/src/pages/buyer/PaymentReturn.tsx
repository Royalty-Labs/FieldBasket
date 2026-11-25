import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import * as api from "../../api/endpoints";
import { useBasket } from "../../basket/useBasket";
import { Notice, PageLoader } from "../../components/Feedback";
import { Icon } from "../../components/Icon";
import { naira } from "../../lib/format";
import { clearPendingReference, pendingReference } from "../../lib/payment";
import { errorMessage } from "../../lib/useApi";
import type { PaymentState } from "../../types";

const CHECKS = 6;
const CHECK_EVERY_MS = 2500;

/** Where Paystack and Interswitch send the buyer back after paying. */
export default function PaymentReturn() {
  const [params] = useSearchParams();
  const reference = params.get("reference") || params.get("txnref") || params.get("trxref") || pendingReference();
  const basket = useBasket();
  const clearBasket = basket.clear;
  const [payment, setPayment] = useState<PaymentState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (!reference) return;
    let active = true;
    let timer: number | undefined;
    let checks = 0;

    async function check() {
      try {
        const result = await api.verifyPayment(reference!);
        if (!active) return;
        setPayment(result);
        setError(null);
        if (result.status === "awaiting_payment" && ++checks < CHECKS) {
          timer = window.setTimeout(check, CHECK_EVERY_MS);
        }
      } catch (err) {
        if (active) setError(errorMessage(err));
      }
    }
    check();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [reference, round]);

  const paid = payment?.status === "paid";
  useEffect(() => {
    if (paid) {
      clearBasket();
      clearPendingReference();
    }
  }, [paid, clearBasket]);

  if (!reference) {
    return (
      <Frame>
        <h1 className="display-3">We couldn't find that payment</h1>
        <p className="pay-result__lead">If money left your account, your orders will still appear once it's confirmed.</p>
        <Link to="/orders" className="btn btn--ink">Go to your orders</Link>
      </Frame>
    );
  }

  if (!payment) {
    return error ? (
      <Frame>
        <Notice tone="error">{error}</Notice>
        <button className="btn btn--ink" onClick={() => setRound((r) => r + 1)}>Try again</button>
      </Frame>
    ) : (
      <Frame>
        <PageLoader label="Confirming your payment" />
      </Frame>
    );
  }

  if (paid) {
    return (
      <Frame>
        <span className="pay-result__icon pay-result__icon--ok" aria-hidden="true">
          <Icon name="check" size={28} strokeWidth={2.4} />
        </span>
        <h1 className="display-3">Payment received</h1>
        <p className="pay-result__lead">
          Thank you. {payment.order_count === 1 ? "Your item" : `Your ${payment.order_count} items`} will be confirmed by
          the farm shortly, and we'll email you as your order moves.
        </p>
        <dl className="pay-result__sum">
          <div><dt>Produce</dt><dd>{naira(payment.items_total)}</dd></div>
          <div><dt>Delivery to {payment.delivery_zone_name}</dt><dd>{naira(payment.delivery_fee)}</dd></div>
          <div className="pay-result__total"><dt>Total paid</dt><dd>{naira(payment.amount_total)}</dd></div>
        </dl>
        <p className="pay-result__ref">Reference {payment.reference}</p>
        <Link to="/orders" className="btn btn--ink btn--lg">Follow your order</Link>
      </Frame>
    );
  }

  if (payment.status === "awaiting_payment") {
    return (
      <Frame>
        <h1 className="display-3">Still confirming your payment</h1>
        <p className="pay-result__lead">
          This can take a minute with bank transfers. Your items are held for you while we wait.
        </p>
        <div className="pay-result__actions">
          <button className="btn btn--ink" onClick={() => setRound((r) => r + 1)}>Check again</button>
          <Link to="/basket" className="btn btn--outline">Back to basket</Link>
        </div>
        <p className="pay-result__ref">Reference {payment.reference}</p>
      </Frame>
    );
  }

  return (
    <Frame>
      <span className="pay-result__icon pay-result__icon--bad" aria-hidden="true">
        <Icon name="close" size={26} strokeWidth={2.4} />
      </span>
      <h1 className="display-3">{payment.status === "expired" ? "This payment timed out" : "The payment didn't go through"}</h1>
      <p className="pay-result__lead">
        You haven't been charged for this order. Your basket is still saved, so you can try again.
      </p>
      <Link to="/basket" className="btn btn--ink btn--lg">Back to basket</Link>
      <p className="pay-result__ref">Reference {payment.reference}</p>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="container container--narrow page-pad">
      <section className="pay-result" aria-live="polite">{children}</section>
    </div>
  );
}
