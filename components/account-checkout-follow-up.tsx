"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

export const AccountCheckoutFollowUp = ({
  checkoutReturned,
}: {
  checkoutReturned: boolean;
}) => {
  const started = useRef(false);

  useEffect(() => {
    if (!checkoutReturned || started.current) {
      return;
    }
    started.current = true;
    toast.message("Thanks. Your upgrade should appear in a moment.");
  }, [checkoutReturned]);

  return null;
};
