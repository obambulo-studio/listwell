"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { PlaceSearch } from "@/components/place-search";
import { CATEGORY_CONFIG, categoryIdSchema, type CategoryId } from "@/lib/category";
import { CHANNEL_CONFIG, channelIdSchema, type ChannelId, type DiscoveredProfile } from "@/lib/channel";
import { type PlaceCandidate } from "@/lib/discover";
import { channelPlaceholder, mapProfilesToBusinessData, unusedChannels } from "@/lib/profiles";
import { addBusinessId } from "@/lib/storage";
import { businessSchema } from "@/lib/schema";

export function NewAuditForm({
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
}) {
  const router = useRouter();
  const [name, setName] = useState(businessName);
  const [category, setCategory] = useState<CategoryId>(categoryId);
  const [profiles, setProfiles] = useState<DiscoveredProfile[]>(initialProfiles);
  const [showAdd, setShowAdd] = useState(false);
  const [channelId, setChannelId] = useState<ChannelId | "">("");
  const [value, setValue] = useState("");
  const [place, setPlace] = useState<PlaceCandidate | null>(null);
  const [address, setAddress] = useState(initialAddress ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const available = useMemo(() => unusedChannels(profiles), [profiles]);

  async function save() {
    if (saving) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = mapProfilesToBusinessData(name, category, profiles);
      if (address.trim()) {
        if (payload.locations.length === 0) {
          payload.locations.push({ name, address: address.trim() });
        } else {
          const first = payload.locations[0];
          if (first && !first.address) {
            first.address = address.trim();
          }
        }
      }
      const response = await fetch(existingId ? `/api/businesses/${existingId}` : "/api/businesses", {
        method: existingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(existingId ? payload : { ...payload, id: crypto.randomUUID() }),
      });
      if (!response.ok) {
        throw new Error("Could not save this audit");
      }
      const business = businessSchema.parse(await response.json());
      addBusinessId(business.id);
      router.push(`/${business.id}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save this audit");
      setSaving(false);
    }
  }

  return (
    <div className="vbg-custom-profiles">
      <section className="vbg-section">
        <h1 className="vbg-title">Here is what we found</h1>
        <p className="vbg-lede">
          Add any listing we missed and remove any that are not yours. Then run the report.
        </p>
      </section>

      <section className="vbg-section">
        <div className="vbg-custom-form">
          <div className="vbg-field">
            <label className="vbg-label" htmlFor="name">
              Business name
            </label>
            <input id="name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="vbg-field">
            <label className="vbg-label" htmlFor="address">
              Address
            </label>
            <input
              id="address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
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
              onChange={(event) => setCategory(categoryIdSchema.parse(event.target.value))}
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
        <div className="vbg-table-wrap">
          <table>
            <caption className="vbg-visually-hidden">Listings attached to this audit</caption>
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
                      {profile.subtitle ? <div className="vbg-meta">{profile.subtitle}</div> : null}
                    </td>
                    <td>
                      <button
                        className="vbg-button vbg-button-quiet"
                        type="button"
                        onClick={() => {
                          setProfiles((current) =>
                            current.filter((item) => !(item.type === profile.type && item.title === profile.title)),
                          );
                        }}
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

        {showAdd ? (
          <form
            className="vbg-custom-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!channelId) {
                return;
              }
              const parsedChannel = channelIdSchema.parse(channelId);
              if (parsedChannel === "google-maps" || parsedChannel === "apple-maps") {
                if (place) {
                  setProfiles((current) => [
                    ...current,
                    {
                      type: parsedChannel,
                      title: place.name,
                      subtitle: place.address ?? (address.trim() || undefined),
                      googlePlaceId: parsedChannel === "google-maps" ? place.id : undefined,
                      appleMapsId: parsedChannel === "apple-maps" ? place.id : undefined,
                    },
                  ]);
                } else if (value.trim()) {
                  setProfiles((current) => [
                    ...current,
                    {
                      type: parsedChannel,
                      title: value.trim(),
                      subtitle: address.trim() || undefined,
                      googlePlaceId: parsedChannel === "google-maps" ? value.trim() : undefined,
                      appleMapsId: parsedChannel === "apple-maps" ? value.trim() : undefined,
                    },
                  ]);
                } else {
                  return;
                }
              } else if (value.trim()) {
                setProfiles((current) => [
                  ...current,
                  {
                    type: parsedChannel,
                    title: value.trim(),
                  },
                ]);
              } else {
                return;
              }
              setValue("");
              setPlace(null);
              setChannelId("");
              setShowAdd(false);
            }}
          >
            <div className="vbg-field">
              <label className="vbg-label" htmlFor="channel">
                Channel
              </label>
              <select
                id="channel"
                value={channelId}
                onChange={(event) => {
                  setChannelId(event.target.value === "" ? "" : channelIdSchema.parse(event.target.value));
                  setValue("");
                  setPlace(null);
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
                  onSelect={(candidate) => {
                    setPlace(candidate);
                    setValue(candidate.id);
                  }}
                />
                <div className="vbg-field">
                  <label className="vbg-label" htmlFor="profileValue">
                    Or paste a listing URL
                  </label>
                  <input
                    id="profileValue"
                    value={place ? "" : value}
                    onChange={(event) => {
                      setPlace(null);
                      setValue(event.target.value);
                    }}
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
                  onSelect={(candidate) => {
                    setPlace(candidate);
                    setValue(candidate.id);
                  }}
                />
                <div className="vbg-field">
                  <label className="vbg-label" htmlFor="appleListingUrl">
                    Or paste a listing URL
                  </label>
                  <input
                    id="appleListingUrl"
                    value={place ? "" : value}
                    onChange={(event) => {
                      setPlace(null);
                      setValue(event.target.value);
                    }}
                    placeholder="https://maps.apple.com/..."
                  />
                </div>
              </>
            ) : null}
            {channelId && channelId !== "google-maps" && channelId !== "apple-maps" ? (
              <div className="vbg-field">
                <label className="vbg-label" htmlFor="profileValue">
                  {CHANNEL_CONFIG[channelId].name}
                </label>
                <input
                  id="profileValue"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
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
                  (channelId === "google-maps" || channelId === "apple-maps" ? !place && !value.trim() : !value.trim())
                }
              >
                Add listing
              </button>
              <button className="vbg-button vbg-button-quiet" type="button" onClick={() => setShowAdd(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="vbg-custom-actions" style={{ marginTop: "24px" }}>
            {available.length > 0 ? (
              <button className="vbg-button vbg-button-quiet" type="button" onClick={() => setShowAdd(true)}>
                Add missing
              </button>
            ) : (
              <p className="vbg-meta">All available channels have been added</p>
            )}
          </div>
        )}
      </section>

      {error ? <p className="vbg-error">{error}</p> : null}

      <div className="vbg-custom-actions">
        <button className="vbg-button" type="button" onClick={() => void save()} disabled={saving || !name.trim()}>
          {saving ? "Saving" : "Get report"}
        </button>
      </div>
    </div>
  );
}
