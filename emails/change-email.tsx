import { AuthCodeEmail, changeEmailPreview } from "./auth-code";

const ChangeEmail = (props: typeof changeEmailPreview) => (
  <AuthCodeEmail {...props} />
);

export default Object.assign(ChangeEmail, {
  PreviewProps: changeEmailPreview,
});
