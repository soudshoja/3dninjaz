"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";
import { BRAND } from "@/lib/brand";

type Props = {
  content: string; // Full markdown from launch.md
};

/**
 * Interactive launch checklist. Steps are parsed from the markdown's h2
 * headings (## Step N — ...). Progress is stored in localStorage so the
 * admin can pick up where they left off.
 */

const STORAGE_KEY = "admin-guide-launch-progress";
const VISITED_KEY = "admin-guide-launch-visited";

function extractSteps(
  content: string
): Array<{ heading: string; body: string; index: number }> {
  const lines = content.split("\n");
  const steps: Array<{ heading: string; body: string; index: number }> = [];
  let current: { heading: string; lines: string[]; index: number } | null =
    null;
  let stepIndex = 0;

  for (const line of lines) {
    if (line.startsWith("## Step ")) {
      if (current) {
        steps.push({
          heading: current.heading,
          body: current.lines.join("\n").trim(),
          index: current.index,
        });
      }
      stepIndex++;
      current = {
        heading: line.slice(3).trim(),
        lines: [],
        index: stepIndex,
      };
    } else if (line.startsWith("## ") && !line.startsWith("## Step ")) {
      // Non-step h2 (e.g. "## Common pitfalls")
      if (current) {
        steps.push({
          heading: current.heading,
          body: current.lines.join("\n").trim(),
          index: current.index,
        });
        current = null;
      }
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) {
    steps.push({
      heading: current.heading,
      body: current.lines.join("\n").trim(),
      index: current.index,
    });
  }
  return steps;
}

function extractSuffix(content: string, marker: string): string {
  const idx = content.indexOf(`\n## ${marker}`);
  if (idx === -1) return "";
  return content.slice(idx).trim();
}

export function LaunchChecklist({ content }: Props) {
  const steps = extractSteps(content);
  const pitfalls = extractSuffix(content, "Common pitfalls");

  const [done, setDone] = useState<Record<number, boolean>>({});
  const [expanded, setExpanded] = useState<number | null>(1);
  const [mounted, setMounted] = useState(false);

  // Mark as visited so the dashboard banner doesn't show
  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setDone(JSON.parse(stored));
      localStorage.setItem(VISITED_KEY, "1");
    } catch {
      /* localStorage unavailable */
    }
  }, []);

  const toggleDone = (idx: number) => {
    setDone((prev) => {
      const next = { ...prev, [idx]: !prev[idx] };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* noop */
      }
      return next;
    });
  };

  const completedCount = Object.values(done).filter(Boolean).length;
  const totalSteps = steps.length;
  const allDone = completedCount === totalSteps;

  if (!mounted) {
    // SSR placeholder — avoid hydration mismatch on checkbox state
    return (
      <div className="space-y-4">
        {steps.map((step) => (
          <div
            key={step.index}
            className="rounded-xl bg-white border"
            style={{ borderColor: `${BRAND.ink}15` }}
          >
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="h-6 w-6 rounded-full border-2 border-slate-300 shrink-0" />
              <span className="font-semibold text-sm">{step.heading}</span>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Progress bar */}
      <div className="rounded-xl bg-white border p-4 space-y-2" style={{ borderColor: `${BRAND.ink}15` }}>
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-slate-700">
            {allDone
              ? "All steps complete! You're ready to launch."
              : `${completedCount} of ${totalSteps} steps done`}
          </span>
          {completedCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setDone({});
                try {
                  localStorage.removeItem(STORAGE_KEY);
                } catch {
                  /* noop */
                }
              }}
              className="text-xs text-slate-400 hover:text-slate-600 underline"
            >
              Reset
            </button>
          )}
        </div>
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${totalSteps === 0 ? 0 : (completedCount / totalSteps) * 100}%`,
              backgroundColor: allDone ? BRAND.green : BRAND.blue,
            }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-3">
        {steps.map((step) => {
          const isDone = !!done[step.index];
          const isOpen = expanded === step.index;

          return (
            <div
              key={step.index}
              className="rounded-xl bg-white border overflow-hidden transition-all"
              style={{
                borderColor: isDone ? `${BRAND.green}55` : `${BRAND.ink}15`,
                backgroundColor: isDone ? `${BRAND.green}08` : "#fff",
              }}
            >
              {/* Step header */}
              <div className="flex items-center gap-3 px-4 py-3">
                {/* Checkbox */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleDone(step.index);
                  }}
                  aria-label={isDone ? "Mark as not done" : "Mark as done"}
                  className="shrink-0 h-6 w-6 rounded-full border-2 flex items-center justify-center transition-all"
                  style={{
                    borderColor: isDone ? BRAND.green : "#cbd5e1",
                    backgroundColor: isDone ? BRAND.green : "transparent",
                  }}
                >
                  {isDone && (
                    <svg
                      viewBox="0 0 12 12"
                      fill="none"
                      className="w-3 h-3"
                      aria-hidden
                    >
                      <path
                        d="M2 6L5 9L10 3"
                        stroke="white"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>

                {/* Heading — click to expand */}
                <button
                  type="button"
                  onClick={() =>
                    setExpanded(isOpen ? null : step.index)
                  }
                  className="flex-1 text-left font-semibold text-sm flex items-center justify-between gap-2"
                  style={{ color: isDone ? "#4a7c59" : BRAND.ink }}
                  aria-expanded={isOpen}
                >
                  <span className={isDone ? "line-through opacity-60" : ""}>
                    {step.heading}
                  </span>
                  <span
                    className="text-slate-400 transition-transform"
                    style={{
                      transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                    }}
                  >
                    ▾
                  </span>
                </button>
              </div>

              {/* Step body */}
              {isOpen && (
                <div
                  className="px-4 pb-4 border-t"
                  style={{ borderColor: `${BRAND.ink}10` }}
                >
                  <div
                    className="prose prose-sm prose-slate max-w-none mt-3
                      prose-p:text-slate-700 prose-li:text-slate-700
                      prose-strong:font-semibold
                      prose-code:bg-slate-100 prose-code:px-1 prose-code:rounded prose-code:text-xs
                      prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline
                    "
                  >
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {step.body}
                    </ReactMarkdown>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      toggleDone(step.index);
                      // Auto-open next step if marking done
                      if (!done[step.index]) {
                        const nextStep = steps.find(
                          (s) => s.index === step.index + 1
                        );
                        if (nextStep) setExpanded(nextStep.index);
                      }
                    }}
                    className="mt-4 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold min-h-[40px] transition-colors"
                    style={{
                      backgroundColor: isDone
                        ? `${BRAND.ink}15`
                        : BRAND.green,
                      color: isDone ? BRAND.ink : "#fff",
                    }}
                  >
                    {isDone ? "Mark as not done" : "Mark step as done ✓"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Common pitfalls */}
      {pitfalls && (
        <div
          className="rounded-xl border p-5 bg-white"
          style={{ borderColor: "#f59e0b44" }}
        >
          <div
            className="prose prose-sm prose-slate max-w-none
              prose-headings:font-[var(--font-heading)]
              prose-h2:text-base prose-h2:mt-0 prose-h2:mb-3
              prose-p:text-slate-700 prose-li:text-slate-700
              prose-strong:font-semibold
            "
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {pitfalls}
            </ReactMarkdown>
          </div>
        </div>
      )}

      {allDone && (
        <div
          className="rounded-xl p-6 text-center"
          style={{ backgroundColor: `${BRAND.green}15` }}
        >
          <p
            className="font-[var(--font-heading)] text-2xl mb-2"
            style={{ color: BRAND.ink }}
          >
            You&apos;re all set!
          </p>
          <p className="text-sm text-slate-600 mb-4">
            Your store is configured and ready for customers.
          </p>
          <Link
            href="/admin"
            className="inline-flex items-center rounded-full px-6 py-3 font-bold text-white min-h-[48px]"
            style={{ backgroundColor: BRAND.ink }}
          >
            Go to Dashboard
          </Link>
        </div>
      )}
    </div>
  );
}
