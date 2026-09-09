import { SignInForm } from "@/components/sign-in-form";
import { firstSearchParam, safeAppPath } from "@/lib/query-params";

export const metadata = {
  title: "Sign in",
};

const SignInPage = async ({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) => {
  const params = await searchParams;
  const returnPath = safeAppPath(firstSearchParam(params.return));

  return (
    <section className="listwell-app-page">
      <SignInForm returnPath={returnPath} />
    </section>
  );
};

export default SignInPage;
