export type StepState = "done" | "active" | "pending";
export type Step = { label: string; state: StepState; detail?: string; href?: string };

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const errorText = (e: unknown) => (e instanceof Error ? e.message : typeof e === "string" ? e : "Something went wrong");
export const inputClass = "w-full rounded-md border border-line bg-cream-raised p-3 font-mono text-sm";
export const shortHash = (h: string) => `${h.slice(0, 10)}…`;

/** Every step of a money move, shown until the money arrives. */
export function Steps({ steps }: { steps: Step[] }) {
  return (
    <ol className="flex flex-col gap-2">
      {steps.map((s) => (
        <li key={s.label} className="flex flex-wrap items-center gap-2 text-sm">
          <span className={`chip ${s.state === "done" ? "chip-forest" : s.state === "active" ? "chip-amber" : ""}`}>
            {s.state === "done" ? "Done" : s.state === "active" ? "Waiting" : "Next"}
          </span>
          <span className={s.state === "pending" ? "text-ink-faint" : ""}>{s.label}</span>
          {s.href ? (
            <a className="font-mono text-xs text-violet underline" href={s.href} target="_blank" rel="noreferrer">
              {s.detail}
            </a>
          ) : (
            s.detail && <span className="font-mono text-xs text-ink-soft">{s.detail}</span>
          )}
        </li>
      ))}
    </ol>
  );
}
