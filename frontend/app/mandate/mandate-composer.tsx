"use client";

import { useState, useTransition } from "react";
import { MAX_MANDATE_TEXT_LENGTH } from "@/lib/mandate/limits";
import {
  BLACKOUT_EVENTS,
  LIMITS,
  SUPPORTED_ASSETS,
  blackoutEventIds,
  validateMandateDraft,
  type Mandate,
  type MandateDraft,
} from "@/lib/mandate/schema";
import { compileMandateAction, finalizeMandateAction } from "./actions";

const EXAMPLE =
  "Conservative, BTC and ETH only, never lose more than 8% a month, no trades during US CPI releases.";

// Form state keeps numbers as the strings the user typed, so a half-typed or empty
// field is visible as invalid instead of silently becoming 0.
type Form = {
  allowedAssets: string[];
  leverageCap: string;
  stopLossPct: string;
  drawdownCapPct: string;
  vetoThresholdUsdc: string;
  blackoutWindows: { event: string; minutesBefore: string; minutesAfter: string }[];
};

const BLANK_FORM: Form = {
  allowedAssets: [],
  leverageCap: "",
  stopLossPct: "",
  drawdownCapPct: "",
  vetoThresholdUsdc: "",
  blackoutWindows: [],
};

function toForm(mandate: MandateDraft): Form {
  return {
    allowedAssets: [...mandate.allowedAssets],
    leverageCap: String(mandate.leverageCap),
    stopLossPct: String(mandate.stopLossPct),
    drawdownCapPct: String(mandate.drawdownCapPct),
    vetoThresholdUsdc: String(mandate.vetoThresholdUsdc),
    blackoutWindows: mandate.blackoutWindows.map((w) => ({
      event: w.event,
      minutesBefore: String(w.minutesBefore),
      minutesAfter: String(w.minutesAfter),
    })),
  };
}

const num = (value: string) => (value.trim() === "" ? Number.NaN : Number(value));

function fromForm(form: Form): unknown {
  return {
    allowedAssets: form.allowedAssets,
    leverageCap: num(form.leverageCap),
    stopLossPct: num(form.stopLossPct),
    drawdownCapPct: num(form.drawdownCapPct),
    vetoThresholdUsdc: num(form.vetoThresholdUsdc),
    blackoutWindows: form.blackoutWindows.map((w) => ({
      event: w.event,
      minutesBefore: num(w.minutesBefore),
      minutesAfter: num(w.minutesAfter),
    })),
  };
}

const inputClass =
  "h-10 w-full rounded-md border border-zinc-300 bg-transparent px-3 text-sm dark:border-zinc-700";
const primaryButton =
  "h-11 rounded-full bg-foreground px-5 text-sm font-medium text-background transition-opacity hover:opacity-85 disabled:opacity-40";
const secondaryButton =
  "h-11 rounded-full border border-zinc-300 px-5 text-sm font-medium dark:border-zinc-700";

export function MandateComposer() {
  const [text, setText] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [assumptions, setAssumptions] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{ mandate: Mandate; coveredUntil: number } | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [isCompiling, startCompile] = useTransition();
  const [isConfirming, startConfirm] = useTransition();

  const validation = form ? validateMandateDraft(fromForm(form)) : null;
  const errors = validation && !validation.ok ? validation.errors : {};

  function update(patch: Partial<Form>) {
    setForm((current) => (current ? { ...current, ...patch } : current));
    setConfirmed(null);
    setConfirmError(null);
  }

  function confirm(draft: MandateDraft) {
    setConfirmError(null);
    startConfirm(async () => {
      const result = await finalizeMandateAction(draft);
      if (result.ok) setConfirmed({ mandate: result.mandate, coveredUntil: result.coveredUntil });
      else setConfirmError(result.message);
    });
  }

  function compile() {
    setNotice(null);
    setConfirmed(null);
    startCompile(async () => {
      const result = await compileMandateAction(text);
      if (result.ok) {
        setForm(toForm(result.compiled.mandate));
        setAssumptions(result.compiled.assumptions);
      } else {
        setNotice(result.message);
      }
    });
  }

  function fillByHand() {
    setNotice(null);
    setAssumptions([]);
    setConfirmed(null);
    setForm(BLANK_FORM);
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <label htmlFor="mandate-text" className="text-sm font-medium">
          Your risk rules
        </label>
        <textarea
          id="mandate-text"
          className="min-h-28 rounded-md border border-zinc-300 bg-transparent p-3 text-sm dark:border-zinc-700"
          placeholder={EXAMPLE}
          maxLength={MAX_MANDATE_TEXT_LENGTH}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex flex-wrap gap-3">
          <button className={primaryButton} disabled={isCompiling || !text.trim()} onClick={compile}>
            {isCompiling ? "Drafting…" : form ? "Draft again" : "Draft my Mandate"}
          </button>
          <button className={secondaryButton} onClick={() => setText(EXAMPLE)}>
            Use the example
          </button>
          {!form && (
            <button className={secondaryButton} onClick={fillByHand}>
              Fill in by hand
            </button>
          )}
        </div>
        {notice && (
          <p role="alert" className="text-sm text-red-600">
            {notice}
          </p>
        )}
      </section>

      {form && (
        <section className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold">Check every field</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              This is a draft. Only what you confirm here is signed.
            </p>
          </div>

          {assumptions.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950/40">
              <p className="font-medium">The draft assumed:</p>
              <ul className="mt-2 list-disc pl-5">
                {assumptions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          )}

          <Field label="Allowed assets" error={errors.allowedAssets}>
            <div className="flex flex-wrap gap-4">
              {SUPPORTED_ASSETS.map((asset) => (
                <label key={asset} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.allowedAssets.includes(asset)}
                    onChange={(e) =>
                      update({
                        allowedAssets: e.target.checked
                          ? SUPPORTED_ASSETS.filter((a) => a === asset || form.allowedAssets.includes(a))
                          : form.allowedAssets.filter((a) => a !== asset),
                      })
                    }
                  />
                  {asset}
                </label>
              ))}
            </div>
          </Field>

          <div className="grid gap-6 sm:grid-cols-2">
            <NumberField
              label="Leverage cap (×)"
              hint={`${LIMITS.leverageCap.min} to ${LIMITS.leverageCap.max}`}
              value={form.leverageCap}
              error={errors.leverageCap}
              onChange={(leverageCap) => update({ leverageCap })}
            />
            <NumberField
              label="Stop-loss (% from entry)"
              hint={`${LIMITS.stopLossPct.min} to ${LIMITS.stopLossPct.max}`}
              value={form.stopLossPct}
              error={errors.stopLossPct}
              onChange={(stopLossPct) => update({ stopLossPct })}
            />
            <NumberField
              label="Drawdown cap (% per month)"
              hint={`${LIMITS.drawdownCapPct.min} to ${LIMITS.drawdownCapPct.max}. New positions stop when it is hit.`}
              value={form.drawdownCapPct}
              error={errors.drawdownCapPct}
              onChange={(drawdownCapPct) => update({ drawdownCapPct })}
            />
            <NumberField
              label="Veto threshold (USDC)"
              hint={`${LIMITS.vetoThresholdUsdc.min} to ${LIMITS.vetoThresholdUsdc.max}. Larger trades wait 60s for your veto.`}
              value={form.vetoThresholdUsdc}
              error={errors.vetoThresholdUsdc}
              onChange={(vetoThresholdUsdc) => update({ vetoThresholdUsdc })}
            />
          </div>

          <Field label="Blackout windows" error={errors.blackoutWindows}>
            <div className="flex flex-col gap-3">
              {form.blackoutWindows.length === 0 && (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">None. Agents may open positions at any time.</p>
              )}
              {form.blackoutWindows.map((w, i) => {
                const patch = (change: Partial<Form["blackoutWindows"][number]>) =>
                  update({
                    blackoutWindows: form.blackoutWindows.map((x, j) => (j === i ? { ...x, ...change } : x)),
                  });
                return (
                  <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                    <select
                      aria-label="Event"
                      className={`${inputClass} w-auto`}
                      value={w.event}
                      onChange={(e) => patch({ event: e.target.value })}
                    >
                      {blackoutEventIds.map((id) => (
                        <option key={id} value={id}>
                          {BLACKOUT_EVENTS[id]}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label="Minutes before"
                      type="number"
                      className={`${inputClass} w-20`}
                      value={w.minutesBefore}
                      onChange={(e) => patch({ minutesBefore: e.target.value })}
                    />
                    <span>min before,</span>
                    <input
                      aria-label="Minutes after"
                      type="number"
                      className={`${inputClass} w-20`}
                      value={w.minutesAfter}
                      onChange={(e) => patch({ minutesAfter: e.target.value })}
                    />
                    <span>min after</span>
                    <button
                      className="text-sm underline"
                      onClick={() => update({ blackoutWindows: form.blackoutWindows.filter((_, j) => j !== i) })}
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
              {form.blackoutWindows.length < blackoutEventIds.length && (
                <button
                  className="self-start text-sm underline"
                  onClick={() => {
                    const used = new Set(form.blackoutWindows.map((w) => w.event));
                    const event = blackoutEventIds.find((id) => !used.has(id)) ?? blackoutEventIds[0];
                    update({
                      blackoutWindows: [...form.blackoutWindows, { event, minutesBefore: "60", minutesAfter: "60" }],
                    });
                  }}
                >
                  Add a blackout window
                </button>
              )}
            </div>
          </Field>

          <div className="flex flex-col gap-3 border-t border-zinc-200 pt-6 dark:border-zinc-800">
            <button
              className={`${primaryButton} self-start`}
              disabled={!validation?.ok || isConfirming}
              onClick={() => validation?.ok && confirm(validation.mandate)}
            >
              {isConfirming ? "Looking up release dates…" : "Confirm Mandate"}
            </button>
            {validation && !validation.ok && (
              <p className="text-sm text-red-600">Fix the highlighted fields before you can confirm.</p>
            )}
            {confirmError && (
              <p role="alert" className="text-sm text-red-600">
                {confirmError}
              </p>
            )}
            {confirmed && (
              <div className="rounded-md border border-zinc-300 p-4 text-sm dark:border-zinc-700">
                <p className="font-medium">Mandate confirmed. This is exactly what you will sign:</p>
                {confirmed.mandate.blackoutWindows.length > 0 && (
                  <div className="mt-3">
                    <p>
                      No new positions open during these {confirmed.mandate.blackoutWindows.length} windows (your
                      local time):
                    </p>
                    <ul className="mt-2 max-h-48 list-disc overflow-y-auto pl-5">
                      {confirmed.mandate.blackoutWindows.map((w) => (
                        <li key={`${w.event}-${w.start}`}>
                          {BLACKOUT_EVENTS[w.event]}: {formatTime(w.start)} to {formatTime(w.end)}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                      Release dates are listed through {formatDay(confirmed.coveredUntil)}. To stay covered after
                      that, sign a new Mandate Version.
                    </p>
                  </div>
                )}
                <pre className="mt-3 max-h-64 overflow-auto font-mono text-xs">
                  {JSON.stringify(confirmed.mandate, null, 2)}
                </pre>
                <p className="mt-3 text-zinc-600 dark:text-zinc-400">
                  Signing with your wallet arrives with Vault creation (ticket #5).
                </p>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

const formatTime = (unixSeconds: number) =>
  new Date(unixSeconds * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const formatDay = (unixSeconds: number) =>
  new Date(unixSeconds * 1000).toLocaleDateString(undefined, { dateStyle: "medium" });

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

function NumberField({
  label,
  hint,
  value,
  error,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>
      <input
        type="number"
        step="any"
        className={`${inputClass} ${error ? "border-red-500" : ""}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className={`text-xs ${error ? "text-red-600" : "text-zinc-500"}`}>{error ?? hint}</span>
    </label>
  );
}
