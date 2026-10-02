"use client";

import { ChevronDownIcon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import type { ReactNode } from "react";
import { z } from "zod";

import { Icon } from "@/components/icon";
import { jobForCheck } from "@/lib/check-jobs";
import type { CheckJob } from "@/lib/check-jobs";
import { pointsFor } from "@/lib/checks/types";
import type { CheckDefinition } from "@/lib/checks/types";
import { formatFixDuration } from "@/lib/fix-plan";
import { fixEffortFromBody } from "@/lib/markdown";
import type { Business } from "@/lib/schema";

export const REPORT_SEGMENTS = [
  "jobs",
  "listing",
  "checks",
  "nearby",
  "research",
] as const;

export type ReportSegment = (typeof REPORT_SEGMENTS)[number];

const SEGMENT_LABEL: Record<ReportSegment, string> = {
  checks: "All checks",
  jobs: "Jobs to do",
  listing: "Your listing",
  nearby: "Nearby businesses",
  research: "Over time",
};

const HIGH_VALUE_POINTS = 6;
const MEDIUM_VALUE_POINTS = 3;

const jobValueLabelSchema = z.enum(["High", "Medium", "Low"]);

const jobValueLabel = (points: number): z.infer<typeof jobValueLabelSchema> => {
  if (points >= HIGH_VALUE_POINTS) {
    return jobValueLabelSchema.parse("High");
  }
  if (points >= MEDIUM_VALUE_POINTS) {
    return jobValueLabelSchema.parse("Medium");
  }
  return jobValueLabelSchema.parse("Low");
};

const ownerLine = (job: CheckJob, minutes: number | null): string => {
  const who =
    job.owner === "website"
      ? "Send this to your website person."
      : "You can do this yourself.";
  if (minutes === null) {
    return who;
  }
  return `${who} ${formatFixDuration(minutes)}.`;
};

const JobRow = ({
  definition,
  open,
  showSteps,
  valueLabel,
  onToggle,
}: {
  definition: CheckDefinition;
  open: boolean;
  showSteps: boolean;
  valueLabel: z.infer<typeof jobValueLabelSchema>;
  onToggle: (id: string) => void;
}) => {
  const job = jobForCheck(definition.id, definition.title);
  const minutes = fixEffortFromBody(definition.body)?.minutes ?? null;
  const detailId = `job-${definition.id}-steps`;
  return (
    <li id={`job-${definition.id}`}>
      <h3 className="m-0">
        <button
          type="button"
          className="listwell-panel__row"
          aria-expanded={open}
          aria-controls={detailId}
          onClick={() => onToggle(definition.id)}
        >
          <span className="listwell-panel__row-main">
            <span className="listwell-panel__row-title">{job.plainTitle}</span>
            {open ? null : (
              <span className="listwell-panel__row-meta line-clamp-1">
                {job.problem}
              </span>
            )}
          </span>
          <span className="listwell-pill">
            <span className="vbg-visually-hidden">Value </span>
            {valueLabel}
          </span>
          <Icon
            className="listwell-panel__chevron"
            icon={ChevronDownIcon}
            size={15}
          />
        </button>
      </h3>
      <div
        className="listwell-disclosure"
        data-open={open ? "true" : "false"}
        id={detailId}
        inert={open ? undefined : true}
      >
        <div className="listwell-disclosure__clip">
          <div className="listwell-panel__detail listwell-report__job-detail">
            <p className="listwell-panel__text">{job.problem}</p>
            <p className="listwell-panel__note">{ownerLine(job, minutes)}</p>
            {showSteps ? (
              <ol className="listwell-fix__steps">
                {job.steps.map((step, index) => (
                  <li key={step} className="listwell-fix__step">
                    <span className="listwell-step" aria-hidden>
                      {index + 1}
                    </span>
                    <span className="listwell-panel__text">{step}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="listwell-panel__note">
                Unlock the full report for the steps.
              </p>
            )}
            {showSteps ? (
              <p className="listwell-panel__note">
                If you get stuck: {job.handoff}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
};

export const ReportJobs = ({
  category,
  checks,
  showSteps,
}: {
  category: Business["category"];
  checks: CheckDefinition[];
  showSteps: boolean;
}) => {
  const [openIds, setOpenIds] = useState<readonly string[]>([]);
  const toggleJob = (id: string) => {
    setOpenIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  };
  const ranked = [...checks].toSorted(
    (left, right) => pointsFor(right, category) - pointsFor(left, category)
  );
  const yours = ranked.filter(
    (definition) => jobForCheck(definition.id, definition.title).owner === "you"
  );
  const website = ranked.filter(
    (definition) =>
      jobForCheck(definition.id, definition.title).owner === "website"
  );
  const group = (
    id: string,
    title: string,
    items: CheckDefinition[]
  ): ReactNode => {
    if (items.length === 0) {
      return null;
    }
    return (
      <section
        className="listwell-panel listwell-report__job-group"
        aria-labelledby={id}
      >
        <h2 className="listwell-panel__group m-0" id={id}>
          {title}
        </h2>
        <ul className="listwell-panel__rows">
          {items.map((definition) => (
            <JobRow
              key={definition.id}
              definition={definition}
              open={openIds.includes(definition.id)}
              showSteps={showSteps}
              valueLabel={jobValueLabel(pointsFor(definition, category))}
              onToggle={toggleJob}
            />
          ))}
        </ul>
      </section>
    );
  };

  if (checks.length === 0) {
    return (
      <section className="listwell-panel">
        <div className="listwell-panel__body">
          <p className="listwell-panel__text">
            Nothing needs doing in the checks we could finish.
          </p>
        </div>
      </section>
    );
  }

  return (
    <div className="listwell-report__jobs">
      {group("job-group-yours", "Do these yourself", yours)}
      {group("job-group-website", "Hand these to your website person", website)}
    </div>
  );
};

const visibleReportSegments = (showResearch: boolean): ReportSegment[] => {
  const segments: ReportSegment[] = [];
  for (const item of REPORT_SEGMENTS) {
    if (showResearch || item !== "research") {
      segments.push(item);
    }
  }
  return segments;
};

export const ReportSegmentNav = ({
  segment,
  showResearch,
  onChange,
}: {
  segment: ReportSegment;
  showResearch: boolean;
  onChange: (segment: ReportSegment) => void;
}) => (
  <nav className="listwell-report__segments" aria-label="Report sections">
    {visibleReportSegments(showResearch).map((item) => (
      <button
        key={item}
        type="button"
        className="listwell-panel__action"
        aria-pressed={segment === item}
        onClick={() => onChange(item)}
      >
        {SEGMENT_LABEL[item]}
      </button>
    ))}
  </nav>
);
