"use client";

import { useEffect } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
    <section className="listwell-app-page max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle>Opening your report</CardTitle>
          <CardDescription>
            Signing you in after payment. This should only take a moment.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            If nothing happens, refresh this page.
          </p>
        </CardContent>
      </Card>
    </section>
  );
};
