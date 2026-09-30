"use client";

import { useEffect } from "react";

export const CheckoutReturnRedirect = ({
  checkoutId,
  businessId,
}: {
  checkoutId: string;
  businessId: string;
}) => {
  useEffect(() => {
    window.location.replace(`/api/auth/checkout/${checkoutId}/${businessId}`);
  }, [businessId, checkoutId]);

  return (
    <section className="listwell-page">
      <div className="listwell-panel">
        <div className="listwell-panel__head">
          <h1 className="listwell-panel__title">Opening your report</h1>
        </div>
        <div className="listwell-panel__body listwell-panel__body--tight">
          <p className="listwell-panel__text" aria-live="polite">
            Signing you in after payment. This should only take a moment.
          </p>
          <p className="listwell-panel__note">
            If nothing happens, refresh this page.
          </p>
        </div>
      </div>
    </section>
  );
};
