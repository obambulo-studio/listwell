interface PreviewKvNamespace {
  binding: string;
  id?: string;
}

interface PreviewWranglerConfig {
  kv_namespaces?: PreviewKvNamespace[];
  preview_urls?: boolean;
  routes?: unknown;
  workers_dev?: boolean;
}

export const PREVIEW_AUDIT_KV_NAMESPACE_ID: string;

export function previewAuditKvIdFromConfig(
  config: unknown,
  envId?: string
): string;

export function readPreviewAuditKvNamespaceId(): string;

export function retargetPreviewKvNamespaces(
  namespaces: unknown,
  previewKvId: string
): unknown;

export function stripProductionOnlyWranglerFields(
  config: PreviewWranglerConfig,
  previewKvId?: string
): PreviewWranglerConfig;

export function prepareWranglerPreviewConfig(): PreviewWranglerConfig;
