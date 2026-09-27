"use client";

import { useRouter } from "next/navigation";
import { useMemo, useReducer } from "react";

import {
  FormActions,
  PrimaryButton,
  QuietButton,
} from "@/components/listwell/actions";
import { ListwellSelect } from "@/components/listwell/select-field";
import { PlaceSearch } from "@/components/place-search";
import { Alert, AlertDescription } from "@/components/reui/alert";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SelectItem } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  <Table>
    <caption className="vbg-visually-hidden">
      Listings attached to this audit
    </caption>
    <TableHeader>
      <TableRow>
        <TableHead scope="col">Channel</TableHead>
        <TableHead scope="col">Listing</TableHead>
        <TableHead scope="col">Action</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {profiles.length === 0 ? (
        <TableRow>
          <TableCell colSpan={3}>
            None yet. Add a website or listing below.
          </TableCell>
        </TableRow>
      ) : (
        profiles.map((profile) => (
          <TableRow key={`${profile.type}-${profile.title}`}>
            <TableCell>{CHANNEL_CONFIG[profile.type].name}</TableCell>
            <TableCell>
              {profile.title}
              {profile.subtitle ? (
                <div className="vbg-meta">{profile.subtitle}</div>
              ) : null}
            </TableCell>
            <TableCell>
              <QuietButton type="button" onClick={() => onRemove(profile)}>
                Not mine
              </QuietButton>
            </TableCell>
          </TableRow>
        ))
      )}
    </TableBody>
  </Table>
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
    <form className="flex flex-col gap-4" action={onSubmitListing}>
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
        placeholder="Select a channel"
      >
        <SelectItem value="__none__">Select a channel</SelectItem>
        {available.map((id) => (
          <SelectItem key={id} value={id}>
            {CHANNEL_CONFIG[id].name}
          </SelectItem>
        ))}
      </ListwellSelect>
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
          <ListwellSelect
            id="category"
            label="Business category"
            value={category}
            onValueChange={(next) =>
              dispatch({
                category: categoryIdSchema.parse(next),
                type: "category",
              })
            }
          >
            {Object.values(CATEGORY_CONFIG).map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.label}
              </SelectItem>
            ))}
          </ListwellSelect>
        </FieldGroup>
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
          <FormActions className="mt-6">
            {available.length > 0 ? (
              <QuietButton
                type="button"
                onClick={() => dispatch({ showAdd: true, type: "show-add" })}
              >
                Add missing
              </QuietButton>
            ) : (
              <p className="vbg-meta">All available channels have been added</p>
            )}
          </FormActions>
        )}
      </section>

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <FormActions>
        <PrimaryButton
          type="button"
          onClick={() => {
            void saveAudit();
          }}
          disabled={state.saving || !name.trim()}
        >
          {state.saving ? "Saving" : "Get report"}
        </PrimaryButton>
      </FormActions>
    </div>
  );
};
