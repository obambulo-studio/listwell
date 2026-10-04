"use client";

import { useId, useState } from "react";
import useSWR from "swr";

import {
  FormActions,
  PrimaryButton,
  QuietButton,
} from "@/components/listwell/actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { apiErrorSchema, businessGuestListSchema } from "@/lib/schema";
import type { BusinessGuestList, BusinessGuestRow } from "@/lib/schema";

const guestApiError = (payload: unknown, fallback: string): string => {
  const parsed = apiErrorSchema.safeParse(payload);
  return parsed.success ? parsed.data.error : fallback;
};

const fetchGuests = async (businessId: string): Promise<BusinessGuestList> => {
  const response = await fetch(`/api/businesses/${businessId}/guests`, {
    credentials: "same-origin",
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(guestApiError(payload, "Could not load guest access"));
  }
  return businessGuestListSchema.parse(payload);
};

const inviteGuest = async (
  businessId: string,
  email: string
): Promise<BusinessGuestList> => {
  const response = await fetch(`/api/businesses/${businessId}/guests`, {
    body: JSON.stringify({ email }),
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(guestApiError(payload, "Could not send invite"));
  }
  return businessGuestListSchema.parse(payload);
};

const revokeGuest = async (
  businessId: string,
  guestEmail: string
): Promise<BusinessGuestList> => {
  const response = await fetch(`/api/businesses/${businessId}/guests`, {
    body: JSON.stringify({ email: guestEmail }),
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    method: "DELETE",
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(guestApiError(payload, "Could not remove access"));
  }
  return businessGuestListSchema.parse(payload);
};

const statusLabel = (status: "pending" | "active" | "revoked"): string => {
  if (status === "pending") {
    return "Pending";
  }
  if (status === "active") {
    return "Active";
  }
  return "Removed";
};

const GuestAccessList = ({
  busy,
  guests,
  isLoading,
  onRemove,
}: {
  busy: boolean;
  guests: BusinessGuestRow[];
  isLoading: boolean;
  onRemove: (guestEmail: string) => void;
}) => {
  if (isLoading) {
    return <p className="listwell-panel__text">Loading guests…</p>;
  }
  if (guests.length === 0) {
    return <p className="listwell-panel__note">No guests yet.</p>;
  }
  return (
    <ul className="listwell-panel__rows" aria-label="Guest access">
      {guests.map((guest) => (
        <li key={guest.id} className="listwell-panel__row">
          <span className="listwell-panel__row-main">
            <span className="listwell-panel__row-title">{guest.email}</span>
            <span className="listwell-panel__row-meta">
              {statusLabel(guest.status)}
            </span>
          </span>
          <button
            className="listwell-account-menu__item"
            disabled={busy}
            onClick={() => {
              onRemove(guest.email);
            }}
            type="button"
          >
            Remove
          </button>
        </li>
      ))}
    </ul>
  );
};

export const BusinessGuestAccessDialog = ({
  businessId,
  businessName,
  open,
  onOpenChange,
}: {
  businessId: string;
  businessName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const emailFieldId = useId();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, mutate, isLoading } = useSWR(
    open ? (["business-guests", businessId] as const) : null,
    ([, id]) => fetchGuests(id),
    { revalidateOnFocus: false }
  );

  const guests = data?.guests ?? [];

  const sendInvite = () => {
    void (async () => {
      setBusy(true);
      setError(null);
      try {
        const next = await inviteGuest(businessId, email);
        await mutate(next, { revalidate: false });
        setEmail("");
      } catch (inviteError) {
        setError(
          inviteError instanceof Error
            ? inviteError.message
            : "Could not send invite"
        );
      }
      setBusy(false);
    })();
  };

  const removeGuestAccess = (guestEmail: string) => {
    void (async () => {
      setBusy(true);
      setError(null);
      try {
        const next = await revokeGuest(businessId, guestEmail);
        await mutate(next, { revalidate: false });
      } catch (revokeError) {
        setError(
          revokeError instanceof Error
            ? revokeError.message
            : "Could not remove access"
        );
      }
      setBusy(false);
    })();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="listwell-dialog">
        <DialogHeader>
          <DialogTitle>Guest access</DialogTitle>
          <DialogDescription>
            Invite someone to view the {businessName} report only. They will not
            see your other businesses or billing.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={emailFieldId}>Email</FieldLabel>
            <Input
              autoComplete="email"
              disabled={busy}
              id={emailFieldId}
              inputMode="email"
              name="guest-email"
              onChange={(event) => {
                setEmail(event.target.value);
              }}
              placeholder="client@example.com"
              type="email"
              value={email}
            />
          </Field>
        </FieldGroup>
        {error ? (
          <p className="listwell-panel__note" role="alert">
            {error}
          </p>
        ) : null}
        <FormActions>
          <PrimaryButton
            disabled={busy || email.trim().length === 0}
            onClick={sendInvite}
            type="button"
          >
            Send invite
          </PrimaryButton>
          <QuietButton
            disabled={busy}
            onClick={() => {
              onOpenChange(false);
            }}
            type="button"
          >
            Close
          </QuietButton>
        </FormActions>
        <div className="listwell-panel__body">
          <GuestAccessList
            busy={busy}
            guests={guests}
            isLoading={isLoading}
            onRemove={removeGuestAccess}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};
