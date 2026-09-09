"use client";

import { useRouter } from "next/navigation";
import { useMemo, useReducer } from "react";

import { PlaceSearch } from "@/components/place-search";
import { CATEGORY_CONFIG, categoryIdSchema } from "@/lib/category";
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
  categoryDraft: CategoryId | null;
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
  | { type: "category"; category: CategoryId }
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
}) => (
  <div className="vbg-table-wrap">
    <table>
      <caption className="vbg-visually-hidden">
        Listings attached to this audit
      </caption>
      <thead>
        <tr>
          <th scope="col">Channel</th>
          <th scope="col">Listing</th>
          <th scope="col">Action</th>
        </tr>
      </thead>
      <tbody>
        {profiles.length === 0 ? (
          <tr>
            <td colSpan={3}>None yet. Add a website or listing below.</td>
          </tr>
        ) : (
          profiles.map((profile) => (
            <tr key={`${profile.type}-${profile.title}`}>
              <td>{CHANNEL_CONFIG[profile.type].name}</td>
              <td>
                {profile.title}
                {profile.subtitle ? (
                  <div className="vbg-meta">{profile.subtitle}</div>
                ) : null}
              </td>
              <td>
                <button
                  className="vbg-button vbg-button-quiet"
                  type="button"
                  onClick={() => onRemove(profile)}
                >
                  Not mine
                </button>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
);

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
    <form className="vbg-custom-form" action={onSubmitListing}>
      <div className="vbg-field">
        <label className="vbg-label" htmlFor="channel">
          Channel
        </label>
        <select
          id="channel"
          name="channel"
          value={channelId}
          onChange={(event) => {
            onChannelChange(
              event.target.value === ""
                ? ""
                : channelIdSchema.parse(event.target.value)
            );
          }}
        >
          <option value="">Select a channel</option>
          {available.map((id) => (
            <option key={id} value={id}>
              {CHANNEL_CONFIG[id].name}
            </option>
          ))}
        </select>
      </div>
      {channelId === "google-maps" ? (
        <>
          <PlaceSearch
            source="google-search"
            label="Google Maps listing"
            onSelect={onPlaceSelect}
          />
          <div className="vbg-field">
            <label className="vbg-label" htmlFor="profileValue">
              Or paste a listing URL
            </label>
            <input
              id="profileValue"
              value={place ? "" : value}
              onChange={(event) => onValueChange(event.target.value)}
              placeholder="https://maps.google.com/..."
            />
          </div>
        </>
      ) : null}
      {channelId === "apple-maps" ? (
        <>
          <PlaceSearch
            source="apple-search"
            label="Apple Maps listing"
            onSelect={onPlaceSelect}
          />
          <div className="vbg-field">
            <label className="vbg-label" htmlFor="appleListingUrl">
              Or paste a listing URL
            </label>
            <input
              id="appleListingUrl"
              value={place ? "" : value}
              onChange={(event) => onValueChange(event.target.value)}
              placeholder="https://maps.apple.com/..."
            />
          </div>
        </>
      ) : null}
      {channelId && !mapsChannel ? (
        <div className="vbg-field">
          <label className="vbg-label" htmlFor="profileValue">
            {CHANNEL_CONFIG[channelId].name}
          </label>
          <input
            id="profileValue"
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            placeholder={channelPlaceholder(channelId)}
          />
        </div>
      ) : null}
      <div className="vbg-custom-actions">
        <button
          className="vbg-button"
          type="submit"
          disabled={
            !channelId ||
            (mapsChannel ? !place && !value.trim() : !value.trim())
          }
        >
          Add listing
        </button>
        <button
          className="vbg-button vbg-button-quiet"
          type="button"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
};

export const NewAuditForm = ({
  businessName,
  categoryId,
  initialProfiles,
  initialAddress,
  existingId,
}: {
  businessName: string;
  categoryId: CategoryId;
  initialProfiles: DiscoveredProfile[];
  initialAddress?: string;
  existingId?: string;
}) => {
  const { push } = useRouter();
  const [state, dispatch] = useReducer(auditFormReducer, initialAuditFormState);
  const name = state.nameDraft ?? businessName;
  const category = state.categoryDraft ?? categoryId;
  const profiles = state.profilesDraft ?? initialProfiles;
  const address = state.addressDraft ?? initialAddress ?? "";
  const available = useMemo(() => unusedChannels(profiles), [profiles]);

  const saveAudit = async () => {
    if (state.saving) {
      return;
    }
    dispatch({ saving: true, type: "saving" });
    try {
      const payload = businessInputFromDiscovery(
        name,
        category,
        profiles,
        address
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
    <div className="vbg-custom-profiles">
      <section className="vbg-section">
        <h1 className="vbg-title">Here is what we found</h1>
        <p className="vbg-lede">
          Add any listing we missed and remove any that are not yours. Then run
          the report.
        </p>
      </section>

      <section className="vbg-section">
        <div className="vbg-custom-form">
          <div className="vbg-field">
            <label className="vbg-label" htmlFor="name">
              Business name
            </label>
            <input
              id="name"
              value={name}
              onChange={(event) =>
                dispatch({ name: event.target.value, type: "name" })
              }
            />
          </div>
          <div className="vbg-field">
            <label className="vbg-label" htmlFor="address">
              Address
            </label>
            <input
              id="address"
              value={address}
              onChange={(event) =>
                dispatch({ address: event.target.value, type: "address" })
              }
              autoComplete="street-address"
            />
          </div>
          <div className="vbg-field">
            <label className="vbg-label" htmlFor="category">
              Business category
            </label>
            <select
              id="category"
              value={category}
              onChange={(event) =>
                dispatch({
                  category: categoryIdSchema.parse(event.target.value),
                  type: "category",
                })
              }
            >
              {Object.values(CATEGORY_CONFIG).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="vbg-section">
        <h2 className="vbg-heading-20">Listings we found</h2>
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
        ) : (
          <div className="vbg-custom-actions" style={{ marginTop: "24px" }}>
            {available.length > 0 ? (
              <button
                className="vbg-button vbg-button-quiet"
                type="button"
                onClick={() => dispatch({ showAdd: true, type: "show-add" })}
              >
                Add missing
              </button>
            ) : (
              <p className="vbg-meta">All available channels have been added</p>
            )}
          </div>
        )}
      </section>

      {state.error ? <p className="vbg-error">{state.error}</p> : null}

      <div className="vbg-custom-actions">
        <button
          className="vbg-button"
          type="button"
          onClick={() => {
            void saveAudit();
          }}
          disabled={state.saving || !name.trim()}
        >
          {state.saving ? "Saving" : "Get report"}
        </button>
      </div>
    </div>
  );
};
