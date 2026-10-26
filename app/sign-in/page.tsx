import { SignInForm } from "@/components/sign-in-form";
import { firstSearchParam, safeAppPath } from "@/lib/query-params";
import {
  canonicalFor,
  listwellSocialMetadata,
  withListwellTitle,
} from "@/lib/site-metadata";

const description = "Sign in to Listwell with an email code.";
const title = "Sign in";

export const metadata = {
  alternates: canonicalFor("/sign-in"),
  description,
  title,
  ...listwellSocialMetadata({
    description,
    pathname: "/sign-in",
    title: withListwellTitle(title),
  }),
};

const SignInPage = async ({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) => {
  const params = await searchParams;
  const returnPath = safeAppPath(firstSearchParam(params.return));

  return (
    <section className="listwell-page">
      <SignInForm returnPath={returnPath} />
    </section>
  );
};

export default SignInPage;
