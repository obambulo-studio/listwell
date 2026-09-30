import { ButtonLink } from "@/components/atoms/button";

const NotFound = () => (
  <section className="listwell-page">
    <div className="listwell-panel">
      <div className="listwell-panel__head">
        <h1 className="listwell-panel__title">This audit was not found</h1>
      </div>
      <div className="listwell-panel__body">
        <p className="listwell-panel__text">
          The report may have expired from this environment, or the link is
          wrong.
        </p>
      </div>
      <div className="listwell-panel__foot">
        <ButtonLink variant="primary" href="/">
          Check a business
        </ButtonLink>
      </div>
    </div>
  </section>
);

export default NotFound;
