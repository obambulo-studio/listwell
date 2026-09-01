"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CATEGORY_CONFIG, categoryIdSchema, type CategoryId } from "@/lib/category";

export function HomeForm() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [category, setCategory] = useState<CategoryId>("other");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="vbg-custom-form"
      onSubmit={(event) => {
        event.preventDefault();
        const name = businessName.trim();
        if (!name) {
          setError("Enter your business name");
          return;
        }
        const params = new URLSearchParams({
          businessName: name,
          categoryId: category,
        });
        if (websiteUrl.trim()) {
          params.set("websiteUrl", websiteUrl.trim());
        }
        router.push(`/discover?${params.toString()}`);
      }}
    >
      <div className="vbg-field">
        <label className="vbg-label" htmlFor="businessName">
          Business name
        </label>
        <input
          id="businessName"
          name="businessName"
          value={businessName}
          onChange={(event) => setBusinessName(event.target.value)}
          autoComplete="organization"
          required
        />
      </div>
      <div className="vbg-field">
        <label className="vbg-label" htmlFor="websiteUrl">
          Website URL
        </label>
        <input
          id="websiteUrl"
          name="websiteUrl"
          type="url"
          value={websiteUrl}
          onChange={(event) => setWebsiteUrl(event.target.value)}
          placeholder="https://"
        />
        <p className="vbg-helper">Optional. Add it now or on the next screen.</p>
      </div>
      <div className="vbg-field">
        <label className="vbg-label" htmlFor="categoryId">
          Business category
        </label>
        <select
          id="categoryId"
          name="categoryId"
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
      {error ? <p className="vbg-error">{error}</p> : null}
      <div className="vbg-custom-actions">
        <button className="vbg-button" type="submit">
          Get my fixes
        </button>
      </div>
    </form>
  );
}
