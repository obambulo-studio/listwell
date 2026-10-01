import { aiOverviewCopy } from "@/lib/research-report";
import type { ResearchView } from "@/lib/research-view";

const SkipLine = ({ text }: { text: string }) => (
  <p className="listwell-panel__note">{text}</p>
);

const percent = (rate: number | null): string =>
  rate === null ? "Unknown" : `${Math.round(rate * 100)}%`;

const ListingResearch = ({ view }: { view: ResearchView }) => (
  <>
    <section className="listwell-panel" aria-labelledby="map-grid-heading">
      <div className="listwell-panel__head">
        <h2 className="listwell-panel__title" id="map-grid-heading">
          Map grid
        </h2>
      </div>
      <div className="listwell-panel__body flex flex-col gap-4">
        {view.gridSkip ? <SkipLine text={view.gridSkip} /> : null}
        {view.grids.map((grid) => (
          <div key={grid.phraseId}>
            <h3 className="text-ink font-medium">{grid.phrase}</h3>
            <p className="listwell-panel__note">{grid.caption}</p>
            <div className="listwell-map-grid">
              {grid.cells.map((cell) => (
                <div className="listwell-map-grid__cell" key={cell.index}>
                  <p className="text-ink m-0 font-medium">
                    {cell.selfRank === null
                      ? "Not in the top 3"
                      : `Position ${cell.selfRank}`}
                  </p>
                  {cell.places.length > 0 ? (
                    <ul className="m-0 list-none p-0">
                      {cell.places.map((place, index) => (
                        // Place names can repeat and this list is not reordered.
                        // react-doctor-disable-next-line react-doctor/no-array-index-as-key
                        <li key={`${cell.index}-${index}`}>{place}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>

    <section className="listwell-panel" aria-labelledby="review-gap-heading">
      <div className="listwell-panel__head">
        <h2 className="listwell-panel__title" id="review-gap-heading">
          Review gap
        </h2>
      </div>
      <div className="listwell-panel__body">
        {view.reviewGapSkip ? <SkipLine text={view.reviewGapSkip} /> : null}
        {view.reviewGap && view.reviewGap.rows.length > 0 ? (
          <table className="listwell-panel__table">
            <thead>
              <tr>
                <th scope="col">Business</th>
                <th scope="col">Reviews</th>
                <th scope="col">Rating</th>
                <th scope="col">Latest review</th>
                <th scope="col">Owner replies</th>
              </tr>
            </thead>
            <tbody>
              {view.reviewGap.rows.map((row) => (
                <tr key={row.placeId}>
                  <th scope="row">
                    {row.isSelf ? "You" : (row.name ?? "Competitor")}
                  </th>
                  <td>{row.reviewCount ?? "Unknown"}</td>
                  <td>{row.rating ?? "Unknown"}</td>
                  <td>{row.latestReviewAt ?? "Unknown"}</td>
                  <td>{percent(row.ownerReplyRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </section>

    <section className="listwell-panel" aria-labelledby="posts-heading">
      <div className="listwell-panel__head">
        <h2 className="listwell-panel__title" id="posts-heading">
          Posts and Q&A
        </h2>
      </div>
      <div className="listwell-panel__body">
        {view.postsSkip ? <SkipLine text={view.postsSkip} /> : null}
        {view.posts ? (
          <p className="listwell-panel__text">
            {view.posts.postsCount} posts, {view.posts.postsLast90Days} in the
            last 90 days. {view.posts.questionsCount} questions,{" "}
            {view.posts.unansweredCount} unanswered.
          </p>
        ) : null}
      </div>
    </section>
  </>
);

const SearchResearch = ({ view }: { view: ResearchView }) => (
  <>
    <section className="listwell-panel" aria-labelledby="ai-overview-heading">
      <div className="listwell-panel__head">
        <h2 className="listwell-panel__title" id="ai-overview-heading">
          AI Overview
        </h2>
      </div>
      <div className="listwell-panel__body">
        {view.aiSkip ? <SkipLine text={view.aiSkip} /> : null}
        {view.aiMentions.length > 0 ? (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {view.aiMentions.map((mention) => (
              <li key={mention.phraseId}>
                <span className="text-ink font-medium">{mention.phrase}. </span>
                {aiOverviewCopy(mention.status)}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>

    <section className="listwell-panel" aria-labelledby="keywords-heading">
      <div className="listwell-panel__head">
        <h2 className="listwell-panel__title" id="keywords-heading">
          Keyword metrics
        </h2>
      </div>
      <div className="listwell-panel__body">
        <p className="listwell-panel__note">
          Search volume is national, for Australia, not your suburb.
        </p>
        {view.keywordSkip ? <SkipLine text={view.keywordSkip} /> : null}
        {view.keywords ? (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {view.keywords.keywords.map((keyword) => (
              <li key={keyword.phraseId}>
                <span className="text-ink font-medium">
                  {keyword.keyword}.{" "}
                </span>
                {keyword.searchVolume === null
                  ? "Volume was not returned."
                  : `${keyword.searchVolume.toLocaleString("en-AU")} searches a month.`}
                {keyword.keywordDifficulty === null
                  ? ""
                  : ` Difficulty ${keyword.keywordDifficulty}.`}
                {keyword.intent ? ` Intent: ${keyword.intent}.` : ""}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>

    <section className="listwell-panel" aria-labelledby="results-heading">
      <div className="listwell-panel__head">
        <h2 className="listwell-panel__title" id="results-heading">
          Results
        </h2>
      </div>
      <div className="listwell-panel__body flex flex-col gap-4">
        <p className="listwell-panel__note">
          Saved organic results from the last research pass. This is not a live
          search.
        </p>
        {view.organicSkip ? <SkipLine text={view.organicSkip} /> : null}
        {view.organic.map((list) => (
          <div key={list.phraseId}>
            <h3 className="text-ink font-medium">{list.phrase}</h3>
            <ol className="m-0 flex list-decimal flex-col gap-2 pl-5">
              {list.results.map((result) => (
                <li key={`${list.phraseId}-${result.position}`}>
                  <span className="text-ink">
                    {result.position}. {result.title ?? "Untitled"}
                  </span>
                  {result.url ? (
                    <span className="block">
                      <a href={result.url} rel="noopener">
                        {result.url}
                      </a>
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </section>

    <section className="listwell-panel" aria-labelledby="domain-heading">
      <div className="listwell-panel__head">
        <h2 className="listwell-panel__title" id="domain-heading">
          Domain estimate
        </h2>
      </div>
      <div className="listwell-panel__body">
        <p className="listwell-panel__note">
          Estimated traffic is a DataForSEO estimate, not your analytics.
        </p>
        {view.domainSkip ? <SkipLine text={view.domainSkip} /> : null}
        {view.domain ? (
          <p className="listwell-panel__text">
            {view.domain.domain}
            {view.domain.estimatedTraffic === null
              ? " had no traffic estimate."
              : ` is estimated at ${view.domain.estimatedTraffic.toLocaleString("en-AU")} visits.`}
          </p>
        ) : null}
      </div>
    </section>

    <section className="listwell-panel" aria-labelledby="backlinks-heading">
      <div className="listwell-panel__head">
        <h2 className="listwell-panel__title" id="backlinks-heading">
          Backlinks
        </h2>
      </div>
      <div className="listwell-panel__body">
        {view.backlinksSkip ? <SkipLine text={view.backlinksSkip} /> : null}
        {view.backlinks ? (
          <p className="listwell-panel__text">
            {view.backlinks.referringDomains ?? "Unknown"} referring domains
            {view.backlinks.backlinks === null
              ? "."
              : ` and ${view.backlinks.backlinks.toLocaleString("en-AU")} backlinks.`}
          </p>
        ) : null}
      </div>
    </section>

    <section className="listwell-panel" aria-labelledby="prospects-heading">
      <div className="listwell-panel__head">
        <h2 className="listwell-panel__title" id="prospects-heading">
          Link prospects
        </h2>
      </div>
      <div className="listwell-panel__body">
        {view.linkProspectsSkip ? (
          <SkipLine text={view.linkProspectsSkip} />
        ) : null}
        {view.linkProspects ? (
          <>
            <p className="listwell-panel__note">
              {view.linkProspects.source === "own_referring_domains"
                ? "Link gap was skipped, so these are domains that already link to you."
                : "Domains that link to a competitor and not to this website."}
            </p>
            <ul className="m-0 list-none p-0">
              {view.linkProspects.domains.map((domain) => (
                <li key={domain.domain}>{domain.domain}</li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </section>
  </>
);

export const ResearchSections = ({ view }: { view: ResearchView | null }) => {
  if (!view) {
    return (
      <section className="listwell-panel">
        <div className="listwell-panel__body">
          <p className="listwell-panel__note">
            Research could not be loaded for this scan.
          </p>
        </div>
      </section>
    );
  }
  return (
    <>
      <ListingResearch view={view} />
      <SearchResearch view={view} />
    </>
  );
};
