"use client";

import { useCallback, useState } from "react";
import type { FormEvent } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { agentKeyListItemSchema } from "@/lib/agent-api-keys";
import type { AgentKeyListItem } from "@/lib/agent-api-keys";

const keysResponseSchema = z.object({
  keys: z.array(agentKeyListItemSchema),
});

const createResponseSchema = z.object({
  id: z.string(),
  key: z.string(),
  prefix: z.string(),
});

export const AccountAgentConnect = ({
  initialKeys,
  initialKeysError = null,
  mcpUrl,
}: {
  initialKeys: AgentKeyListItem[];
  initialKeysError?: string | null;
  mcpUrl: string;
}) => {
  const [keys, setKeys] = useState(initialKeys);
  const [loading, setLoading] = useState(false);
  const [label, setLabel] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialKeysError);

  const refreshKeys = useCallback(async () => {
    setLoading(true);
    setError(null);
    const response = await fetch("/api/account/agent-keys");
    if (!response.ok) {
      setLoading(false);
      setError("Could not load API keys.");
      return;
    }
    const parsed = keysResponseSchema.safeParse(await response.json());
    setLoading(false);
    if (!parsed.success) {
      setError("Could not load API keys.");
      return;
    }
    setKeys(parsed.data.keys);
  }, []);

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setCreatedKey(null);
    const response = await fetch("/api/account/agent-keys", {
      body: JSON.stringify({ label: label.trim() || "Grok" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    if (!response.ok) {
      setLoading(false);
      setError("Could not create API key.");
      return;
    }
    const parsed = createResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      setLoading(false);
      setError("Could not create API key.");
      return;
    }
    setCreatedKey(parsed.data.key);
    setLabel("");
    await refreshKeys();
    setLoading(false);
  };

  const onRevoke = async (id: string) => {
    setLoading(true);
    setError(null);
    const response = await fetch(`/api/account/agent-keys/${id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      setLoading(false);
      setError("Could not revoke API key.");
      return;
    }
    await refreshKeys();
    setLoading(false);
  };

  return (
    <div className="listwell-panel">
      <div className="listwell-panel__head">
        <h1 className="listwell-panel__title">MCP setup</h1>
      </div>
      <div className="listwell-panel__body listwell-panel__text">
        <p>
          Add Listwell to Grok, Claude, Cursor, or any MCP client. Public tools
          run free basic audits; create an API key below to read your saved
          businesses and entitled fix steps.
        </p>
        <p>
          MCP server URL: <code className="listwell-code-inline">{mcpUrl}</code>
        </p>
        <p>
          Send{" "}
          <code className="listwell-code-inline">
            Authorization: Bearer lw_…
          </code>{" "}
          on <code className="listwell-code-inline">list_my_businesses</code>{" "}
          and <code className="listwell-code-inline">get_business_report</code>.
        </p>
        {createdKey ? (
          <output className="listwell-notice">
            Copy your new key now. It will not be shown again:{" "}
            <code className="listwell-code-inline">{createdKey}</code>
          </output>
        ) : null}
        {error ? (
          <p className="listwell-notice listwell-notice--error" role="alert">
            {error}
          </p>
        ) : null}
        <form className="listwell-form-row" onSubmit={onCreate}>
          <Input
            aria-label="Key label"
            disabled={loading}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Label (e.g. Grok)"
            value={label}
          />
          <Button disabled={loading} type="submit" variant="secondary">
            Create API key
          </Button>
        </form>
        {loading && keys.length === 0 ? (
          <p className="listwell-panel__note">Loading keys…</p>
        ) : null}
        {keys.length > 0 ? (
          <ul className="listwell-legal__list">
            {keys.map((key) => (
              <li key={key.id}>
                <span>
                  {key.label} · {key.prefix}…{key.revokedAt ? " (revoked)" : ""}
                </span>{" "}
                {key.revokedAt ? null : (
                  <Button
                    disabled={loading}
                    onClick={async () => {
                      await onRevoke(key.id);
                    }}
                    type="button"
                    variant="ghost"
                  >
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
};
