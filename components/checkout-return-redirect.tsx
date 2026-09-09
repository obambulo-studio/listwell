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
    <section className="vbg-opening">
      <h1 className="vbg-title">Opening your report</h1>
      <p className="vbg-lede">Signing you in after payment.</p>
    </section>
  );
};
