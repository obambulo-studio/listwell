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

export const NewAuditForm = ({
  businessName,
  categoryId,
  categoryLabel = null,
  initialProfiles,
  initialAddress,
  existingId,
}: {
  businessName: string;
  categoryId: CategoryId;
  categoryLabel?: string | null;
  initialProfiles: DiscoveredProfile[];
  initialAddress?: string;
  existingId?: string;
}) => {
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
        name,
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
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="name">Business name</FieldLabel>
              <Input
                id="name"
                value={name}
                onChange={(event) =>
                  dispatch({ name: event.target.value, type: "name" })
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="address">Address</FieldLabel>
              <Input
                id="address"
                value={address}
                onChange={(event) =>
                  dispatch({ address: event.target.value, type: "address" })
                }
                autoComplete="street-address"
              />
            </Field>
            <ListwellCategoryField
              id="category"
              label="Business category"
              value={category}
              onValueChange={(next) =>
                dispatch({
                  category: next,
                  type: "category",
                })
              }
            />
          </FieldGroup>
        </div>
      </section>

      <section className="listwell-panel" aria-labelledby="audit-listings">
        <div className="listwell-panel__head">
          <h2 id="audit-listings" className="listwell-panel__title">
            Listings
          </h2>
          {state.showAdd || available.length === 0 ? null : (
            <button
              type="button"
              className="listwell-panel__action"
              onClick={() => dispatch({ showAdd: true, type: "show-add" })}
            >
              Add missing
            </button>
          )}
        </div>
        <AuditListingsTable
          profiles={profiles}
          onRemove={(profile) => {
            dispatch({
              profiles: profiles.filter(
                (item) =>
                  !(item.type === profile.type && item.title === profile.title)
              ),
              type: "profiles",
            });
          }}
        />

        {state.showAdd ? (
          <AddListingForm
            available={available}
            channelId={state.channelId}
            onChannelChange={(channelId) =>
              dispatch({ channelId, type: "channel" })
            }
            onCancel={() => dispatch({ showAdd: false, type: "show-add" })}
            onPlaceSelect={(candidate) => {
              dispatch({
                place: candidate,
                type: "place",
                value: candidate.id,
              });
            }}
            onSubmitListing={submitListing}
            onValueChange={(nextValue) =>
              dispatch({ type: "value", value: nextValue })
            }
            place={state.place}
            value={state.value}
          />
        ) : null}
        {!state.showAdd && available.length === 0 ? (
          <div className="listwell-panel__foot">
            <p className="listwell-panel__fine">
              All available channels have been added
            </p>
          </div>
        ) : null}
      </section>

      {state.error ? (
        <p className="listwell-notice listwell-notice--error" role="alert">
          {state.error}
        </p>
      ) : null}

      <PrimaryButton
        type="button"
        className="w-full"
        onClick={() => {
          void saveAudit();
        }}
        disabled={state.saving || !name.trim()}
      >
        {state.saving ? "Saving" : "Get report"}
      </PrimaryButton>
    </div>
  );
};
