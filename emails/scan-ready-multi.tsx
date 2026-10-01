import { ScanReadyEmail, scanReadyMultiPreview } from "./scan-ready";

const ScanReadyMultiEmail = (props: typeof scanReadyMultiPreview) => (
  <ScanReadyEmail {...props} />
);

export default Object.assign(ScanReadyMultiEmail, {
  PreviewProps: scanReadyMultiPreview,
});
