"use client";

import { useRouter } from "next/navigation";
import { useMemo, useReducer } from "react";

import {
  FormActions,
  PrimaryButton,
  QuietButton,
} from "@/components/listwell/actions";
import {
  ListwellCategoryField,
  ListwellSelect,
} from "@/components/listwell/select-field";
import { PlaceSearch } from "@/components/place-search";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  categoryDisplayLabel,
  persistedCategoryLabel,
  resolveTypedCategory,
} from "@/lib/category";
import type { CategoryId } from "@/lib/category";
import { CHANNEL_CONFIG, channelIdSchema } from "@/lib/channel";
import type { ChannelId, DiscoveredProfile } from "@/lib/channel";
import type { PlaceCandidate } from "@/lib/discover";
import {
  businessInputFromDiscovery,
  channelPlaceholder,
  unusedChannels,
} from "@/lib/profiles";
import { businessSchema } from "@/lib/schema";
import { addBusinessId } from "@/lib/storage";
import { normalizeBusinessName } from "@/lib/text-normalize";

interface AuditFormState {
  addressDraft: string | null;
  categoryDraft: string | null;
  channelId: ChannelId | "";
  error: string | null;
  nameDraft: string | null;
  place: PlaceCandidate | null;
  profilesDraft: DiscoveredProfile[] | null;
  saving: boolean;
  showAdd: boolean;
  value: string;
}

type AuditFormAction =
  | { type: "address"; address: string }
  | { type: "category"; category: string }
  | { type: "channel"; channelId: ChannelId | "" }
  | { type: "error"; error: string | null }
  | { type: "listing-added"; profiles: DiscoveredProfile[] }
  | { type: "name"; name: string }
  | { type: "place"; place: PlaceCandidate | null; value?: string }
  | { type: "profiles"; profiles: DiscoveredProfile[] }
  | { type: "saving"; saving: boolean }
  | { type: "show-add"; showAdd: boolean }
  | { type: "value"; value: string };

const initialAuditFormState: AuditFormState = {
  addressDraft: null,
  categoryDraft: null,
  channelId: "",
  error: null,
  nameDraft: null,
  place: null,
  profilesDraft: null,
  saving: false,
  showAdd: false,
  value: "",
};

const auditFormReducer = (
  state: AuditFormState,
  action: AuditFormAction
): AuditFormState => {
  switch (action.type) {
    case "address": {
      return { ...state, addressDraft: action.address };
    }
    case "category": {
      return { ...state, categoryDraft: action.category };
    }
    case "channel": {
      return { ...state, channelId: action.channelId, place: null, value: "" };
    }
    case "error": {
      return { ...state, error: action.error, saving: false };
    }
    case "listing-added": {
      return {
        ...state,
        channelId: "",
        place: null,
        profilesDraft: action.profiles,
        showAdd: false,
        value: "",
      };
    }
    case "name": {
      return { ...state, nameDraft: action.name };
    }
    case "place": {
      return {
        ...state,
        place: action.place,
        value: action.value ?? state.value,
      };
    }
    case "profiles": {
      return { ...state, profilesDraft: action.profiles };
    }
    case "saving": {
      return { ...state, error: null, saving: action.saving };
    }
    case "show-add": {
      return { ...state, showAdd: action.showAdd };
    }
    case "value": {
      return { ...state, place: null, value: action.value };
    }
    default: {
      return state;
    }
  }
};

const profileFromPlace = (
  channel: ChannelId,
  place: PlaceCandidate,
  address: string
): DiscoveredProfile => ({
  appleMapsId: channel === "apple-maps" ? place.id : undefined,
  googlePlaceId: channel === "google-maps" ? place.id : undefined,
  subtitle: place.address ?? (address.trim() || undefined),
  title: place.name,
  type: channel,
});

const profileFromValue = (
  channel: ChannelId,
  value: string,
  address: string
): DiscoveredProfile => {
  if (channel === "google-maps" || channel === "apple-maps") {
    return {
      appleMapsId: channel === "apple-maps" ? value : undefined,
      googlePlaceId: channel === "google-maps" ? value : undefined,
      subtitle: address.trim() || undefined,
      title: value,
      type: channel,
    };
  }
  return { title: value, type: channel };
};

const AuditListingsTable = ({
  profiles,
  onRemove,
}: {
  profiles: DiscoveredProfile[];
  onRemove: (profile: DiscoveredProfile) => void;
}) => {
  if (profiles.length === 0) {
    return (
      <div className="listwell-panel__body">
        <p className="listwell-panel__note">
          None yet. Add a website or listing.
        </p>
      </div>
    );
  }
  return (
    <ul
      className="listwell-panel__rows"
      aria-label="Listings attached to this audit"
    >
      {profiles.map((profile) => (
        <li
          key={`${profile.type}-${profile.title}`}
          className="listwell-panel__row"
        >
          <span className="listwell-panel__row-main">
            <span className="listwell-panel__row-title break-all">
              {profile.title}
            </span>
            <span className="listwell-panel__row-meta">
              {[CHANNEL_CONFIG[profile.type].name, profile.subtitle]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
          <button
            type="button"
            className="listwell-panel__action"
            onClick={() => onRemove(profile)}
            aria-label={`Not mine: ${profile.title}`}
          >
            Not mine
          </button>
        </li>
      ))}
    </ul>
  );
};

const AddListingForm = ({
  available,
  channelId,
  onChannelChange,
  onCancel,
  onPlaceSelect,
  onSubmitListing,
  onValueChange,
  place,
  value,
}: {
  available: ChannelId[];
  channelId: ChannelId | "";
  onChannelChange: (channelId: ChannelId | "") => void;
  onCancel: () => void;
  onPlaceSelect: (candidate: PlaceCandidate) => void;
  onSubmitListing: () => void;
  onValueChange: (value: string) => void;
  place: PlaceCandidate | null;
  value: string;
}) => {
  const mapsChannel = channelId === "google-maps" || channelId === "apple-maps";
  return (
    <form className="listwell-panel__body" action={onSubmitListing}>
      <ListwellSelect
        id="channel"
        label="Channel"
        value={channelId === "" ? "__none__" : channelId}
        onValueChange={(next) => {
          if (!next || next === "__none__") {
            onChannelChange("");
            return;
          }
          onChannelChange(channelIdSchema.parse(next));
        }}
        items={[
          { label: "Select a channel", value: "__none__" },
          ...available.map((id) => ({
            label: CHANNEL_CONFIG[id].name,
            value: id,
          })),
        ]}
      />
      {channelId === "google-maps" ? (
        <>
          <PlaceSearch
            source="google-search"
            label="Google Maps listing"
            onSelect={onPlaceSelect}
          />
          <Field>
            <FieldLabel htmlFor="profileValue">
              Or paste a listing URL
            </FieldLabel>
            <Input
              id="profileValue"
              value={place ? "" : value}
              onChange={(event) => onValueChange(event.target.value)}
              placeholder="https://maps.google.com/..."
            />
          </Field>
        </>
      ) : null}
      {channelId === "apple-maps" ? (
        <>
          <PlaceSearch
            source="apple-search"
            label="Apple Maps listing"
            onSelect={onPlaceSelect}
          />
          <Field>
            <FieldLabel htmlFor="appleListingUrl">
              Or paste a listing URL
            </FieldLabel>
            <Input
              id="appleListingUrl"
              value={place ? "" : value}
              onChange={(event) => onValueChange(event.target.value)}
              placeholder="https://maps.apple.com/..."
            />
          </Field>
        </>
      ) : null}
      {channelId && !mapsChannel ? (
        <Field>
          <FieldLabel htmlFor="profileValue-other">
            {CHANNEL_CONFIG[channelId].name}
          </FieldLabel>
          <Input
            id="profileValue-other"
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            placeholder={channelPlaceholder(channelId)}
          />
        </Field>
      ) : null}
      <FormActions>
        <PrimaryButton
          type="submit"
          disabled={
            !channelId ||
            (mapsChannel ? !place && !value.trim() : !value.trim())
          }
        >
          Add listing
        </PrimaryButton>
        <QuietButton type="button" onClick={onCancel}>
          Cancel
        </QuietButton>
      </FormActions>
    </form>
  );
};

interface NewAuditFormBaseProps {
  businessName: string;
  categoryId: CategoryId;
  categoryLabel?: string | null;
  initialProfiles: DiscoveredProfile[];
  initialAddress?: string;
  existingId?: string;
}

type NewAuditFormProps = NewAuditFormBaseProps &
  (
    | {
        onCancel?: undefined;
        onSaved?: undefined;
        presentation?: "page";
      }
    | {
        onCancel: () => void;
        onSaved?: () => void | Promise<void>;
        presentation: "dialog";
      }
  );

const AuditDetailsFields = ({
  address,
  category,
  name,
  onAddress,
  onCategory,
  onName,
}: {
  address: string;
  category: string;
  name: string;
  onAddress: (address: string) => void;
  onCategory: (category: string) => void;
  onName: (name: string) => void;
}) => (
  <FieldGroup className="gap-4">
    <Field>
      <FieldLabel htmlFor="name">Business name</FieldLabel>
      <Input
        id="name"
        value={name}
        onChange={(event) => onName(event.target.value)}
      />
    </Field>
    <Field>
      <FieldLabel htmlFor="address">Address</FieldLabel>
      <Input
        id="address"
        value={address}
        onChange={(event) => onAddress(event.target.value)}
        autoComplete="street-address"
      />
    </Field>
    <ListwellCategoryField
      id="category"
      label="Business category"
      value={category}
      onValueChange={onCategory}
    />
  </FieldGroup>
);

const AuditListingsEditor = ({
  available,
  channelId,
  place,
  profiles,
  showAdd,
  value,
  onCancelAdd,
  onChannelChange,
  onPlaceSelect,
  onRemove,
  onShowAdd,
  onSubmitListing,
  onValueChange,
}: {
  available: ChannelId[];
  channelId: ChannelId | "";
  place: PlaceCandidate | null;
  profiles: DiscoveredProfile[];
  showAdd: boolean;
  value: string;
  onCancelAdd: () => void;
  onChannelChange: (channelId: ChannelId | "") => void;
  onPlaceSelect: (candidate: PlaceCandidate) => void;
  onRemove: (profile: DiscoveredProfile) => void;
  onShowAdd: () => void;
  onSubmitListing: () => void;
  onValueChange: (value: string) => void;
}) => (
  <section className="listwell-panel" aria-labelledby="audit-listings">
    <div className="listwell-panel__head">
      <h2 id="audit-listings" className="listwell-panel__title">
        Listings
      </h2>
      {showAdd || available.length === 0 ? null : (
        <button
          type="button"
          className="listwell-panel__action"
          onClick={onShowAdd}
        >
          Add missing
        </button>
      )}
    </div>
    <AuditListingsTable profiles={profiles} onRemove={onRemove} />
    {showAdd ? (
      <AddListingForm
        available={available}
        channelId={channelId}
        onChannelChange={onChannelChange}
        onCancel={onCancelAdd}
        onPlaceSelect={onPlaceSelect}
        onSubmitListing={onSubmitListing}
        onValueChange={onValueChange}
        place={place}
        value={value}
      />
    ) : null}
    {showAdd || available.length > 0 ? null : (
      <div className="listwell-panel__foot">
        <p className="listwell-panel__fine">
          All available channels have been added
        </p>
      </div>
    )}
  </section>
);

export const NewAuditForm = ({
  businessName,
  categoryId,
  categoryLabel = null,
  initialProfiles,
  initialAddress,
  existingId,
  presentation = "page",
  onCancel,
  onSaved,
}: NewAuditFormProps) => {
  const { push } = useRouter();
  const [state, dispatch] = useReducer(auditFormReducer, initialAuditFormState);
  const name = state.nameDraft ?? businessName;
  const category =
    state.categoryDraft ?? categoryDisplayLabel(categoryId, categoryLabel);
  const profiles = state.profilesDraft ?? initialProfiles;
  const address = state.addressDraft ?? initialAddress ?? "";
  const available = useMemo(() => unusedChannels(profiles), [profiles]);

  const saveAudit = async () => {
    if (state.saving) {
      return;
    }
    dispatch({ saving: true, type: "saving" });
    try {
      const choice = resolveTypedCategory(category);
      const payload = businessInputFromDiscovery(
        normalizeBusinessName(name),
        choice.categoryId,
        profiles,
        address,
        persistedCategoryLabel(choice)
      );
      const response = await fetch(
        existingId ? `/api/businesses/${existingId}` : "/api/businesses",
        {
          body: JSON.stringify(
            existingId ? payload : { ...payload, id: crypto.randomUUID() }
          ),
          headers: { "Content-Type": "application/json" },
          method: existingId ? "PUT" : "POST",
        }
      );
      if (!response.ok) {
        dispatch({ error: "Could not save this audit", type: "error" });
        return;
      }
      const business = businessSchema.parse(await response.json());
      addBusinessId(business.id);
      if (presentation === "dialog") {
        await onSaved?.();
        return;
      }
      push(`/${business.id}`);
    } catch (saveError) {
      dispatch({
        error:
          saveError instanceof Error
            ? saveError.message
            : "Could not save this audit",
        type: "error",
      });
    }
  };

  const submitListing = () => {
    if (!state.channelId) {
      return;
    }
    const parsedChannel = channelIdSchema.parse(state.channelId);
    if (parsedChannel === "google-maps" || parsedChannel === "apple-maps") {
      if (state.place) {
        dispatch({
          profiles: [
            ...profiles,
            profileFromPlace(parsedChannel, state.place, address),
          ],
          type: "listing-added",
        });
        return;
      }
      if (state.value.trim()) {
        dispatch({
          profiles: [
            ...profiles,
            profileFromValue(parsedChannel, state.value.trim(), address),
          ],
          type: "listing-added",
        });
      }
      return;
    }
    if (!state.value.trim()) {
      return;
    }
    dispatch({
      profiles: [
        ...profiles,
        profileFromValue(parsedChannel, state.value.trim(), address),
      ],
      type: "listing-added",
    });
  };

  const detailsFields = (
    <AuditDetailsFields
      address={address}
      category={category}
      name={name}
      onAddress={(nextAddress) =>
        dispatch({ address: nextAddress, type: "address" })
      }
      onCategory={(nextCategory) =>
        dispatch({ category: nextCategory, type: "category" })
      }
      onName={(nextName) => dispatch({ name: nextName, type: "name" })}
    />
  );
  const listingsEditor = (
    <AuditListingsEditor
      available={available}
      channelId={state.channelId}
      place={state.place}
      profiles={profiles}
      showAdd={state.showAdd}
      value={state.value}
      onCancelAdd={() => dispatch({ showAdd: false, type: "show-add" })}
      onChannelChange={(channelId) => dispatch({ channelId, type: "channel" })}
      onPlaceSelect={(candidate) => {
        dispatch({
          place: candidate,
          type: "place",
          value: candidate.id,
        });
      }}
      onRemove={(profile) => {
        dispatch({
          profiles: profiles.filter(
            (item) =>
              !(item.type === profile.type && item.title === profile.title)
          ),
          type: "profiles",
        });
      }}
      onShowAdd={() => dispatch({ showAdd: true, type: "show-add" })}
      onSubmitListing={submitListing}
      onValueChange={(nextValue) =>
        dispatch({ type: "value", value: nextValue })
      }
    />
  );
  const saveDisabled = state.saving || !name.trim();
  const errorNotice = state.error ? (
    <p className="listwell-notice listwell-notice--error" role="alert">
      {state.error}
    </p>
  ) : null;

  if (presentation === "dialog") {
    return (
      <div className="flex flex-col gap-4">
        {detailsFields}
        {listingsEditor}
        {errorNotice}
        <FormActions className="justify-end pt-0">
          <QuietButton
            disabled={state.saving}
            type="button"
            onClick={() => {
              onCancel?.();
            }}
          >
            Cancel
          </QuietButton>
          <PrimaryButton
            type="button"
            disabled={saveDisabled}
            loading={state.saving}
            onClick={() => {
              void saveAudit();
            }}
          >
            Save
          </PrimaryButton>
        </FormActions>
      </div>
    );
  }

  return (
    <div className="listwell-page">
      <section className="listwell-panel" aria-labelledby="audit-details">
        <div className="listwell-panel__head">
          <h1 id="audit-details" className="listwell-panel__title">
            {existingId ? "Edit business" : "Here is what we found"}
          </h1>
        </div>
        <div className="listwell-panel__body">
          <p className="listwell-panel__note">
            Add any listing we missed and remove any that are not yours. Then
            run the report.
          </p>
          {detailsFields}
        </div>
      </section>
      {listingsEditor}
      {errorNotice}
      <PrimaryButton
        type="button"
        className="w-full"
        onClick={() => {
          void saveAudit();
        }}
        disabled={saveDisabled}
        loading={state.saving}
      >
        Get report
      </PrimaryButton>
    </div>
  );
};

export const EditListingsDialog = ({
  businessName,
  categoryId,
  categoryLabel = null,
  existingId,
  formKey,
  initialAddress,
  initialProfiles,
  open,
  onOpenChange,
  onSaved,
}: {
  businessName: string;
  categoryId: CategoryId;
  categoryLabel?: string | null;
  existingId: string;
  formKey: number;
  initialAddress?: string;
  initialProfiles: DiscoveredProfile[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void | Promise<void>;
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="flex max-h-[min(40rem,calc(100dvh-2rem))] max-w-lg flex-col overflow-hidden">
      <DialogHeader className="pr-8">
        <DialogTitle>Edit listings</DialogTitle>
        <DialogDescription className="text-foreground leading-relaxed">
          Add any listing we missed and remove any that are not yours.
        </DialogDescription>
      </DialogHeader>
      <div className="min-h-0 overflow-y-auto">
        <NewAuditForm
          key={formKey}
          businessName={businessName}
          categoryId={categoryId}
          categoryLabel={categoryLabel}
          existingId={existingId}
          initialAddress={initialAddress}
          initialProfiles={initialProfiles}
          presentation="dialog"
          onCancel={() => onOpenChange(false)}
          onSaved={onSaved}
        />
      </div>
    </DialogContent>
  </Dialog>
);
