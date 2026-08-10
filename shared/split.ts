/**
 * Pure split engine, imported by both the browser and the server so a share
 * link can never disagree with what was on screen.
 *
 * Money is integer cents throughout. Float dollars let shares drift off the
 * bill: at $45.00 over 8 slices, rounding each `slices * pricePerSlice`
 * independently yields 16.88 + 22.50 + 5.63 = $45.01.
 */

export type Person = { id: string; name: string; slices: number };
export type SplitInput = { totalCents: number; people: Person[] };
export type SplitResult = {
  /** Parallel to `people`; always sums to exactly `totalCents`. */
  shares: number[];
  totalSlices: number;
  /** Display only, never an input to allocation. May be fractional. */
  perSliceCents: number;
};
export type Invalid = { error: string };

export const LIMITS = { people: 50, slices: 100, totalCents: 100_000_000, name: 40 } as const;

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
export const formatCents = (cents: number) => money.format(cents / 100);

export const clampSlices = (v: unknown) => Math.max(0, Math.min(LIMITS.slices, Math.floor(Number(v)) || 0));

/** The label shown when someone never typed a name. */
export const displayName = (p: Person, i: number) => p.name.trim() || `Person ${i + 1}`;

/** Typed money to cents; `null` when unrepresentable, so callers can tell garbage from zero. */
export function parseMoneyToCents(input: string): number | null {
  // Outer space is forgiven and $/, stripped, but interior space is not:
  // "4 5" is a typo, not forty-five.
  const s = input.trim().replace(/[$,]/g, "");
  if (s === "") return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole = "0", frac = ""] = s.split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents <= LIMITS.totalCents ? cents : null;
}

/**
 * Split `totalCents` proportionally to `slices` by largest remainder, so the
 * parts always add back to the whole: everyone takes their floor share, then
 * the few leftover cents go one apiece to the largest remainders, ties by
 * index so the result is deterministic.
 */
export function allocate(totalCents: number, slices: number[]): number[] {
  const totalSlices = slices.reduce((a, b) => a + b, 0);
  if (totalSlices <= 0 || totalCents <= 0) return slices.map(() => 0);

  const shares = slices.map((s) => Math.floor((totalCents * s) / totalSlices));
  const byRemainder = slices
    .map((s, i) => ({ i, rem: (totalCents * s) % totalSlices }))
    .sort((a, b) => b.rem - a.rem || a.i - b.i);

  let leftover = totalCents - shares.reduce((a, b) => a + b, 0);
  for (let k = 0; leftover > 0; k++, leftover--) shares[byRemainder[k]!.i]! += 1;
  return shares;
}

export function computeSplit({ totalCents, people }: SplitInput): SplitResult {
  const slices = people.map((p) => p.slices);
  const totalSlices = slices.reduce((a, b) => a + b, 0);
  return {
    shares: allocate(totalCents, slices),
    totalSlices,
    perSliceCents: totalSlices > 0 ? totalCents / totalSlices : 0,
  };
}

const int = (v: unknown, max: number): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= max;

/**
 * Trust boundary for anything arriving over HTTP. Rejects rather than silently
 * clamping, so a malformed client hears about it instead of persisting
 * something subtly different from what it sent.
 */
export function parseSplitInput(raw: unknown): SplitInput | Invalid {
  if (typeof raw !== "object" || raw === null) return { error: "Body must be a JSON object." };
  const { totalCents, people } = raw as Record<string, unknown>;

  if (!int(totalCents, LIMITS.totalCents)) return { error: "totalCents is out of range." };
  if (!Array.isArray(people) || !people.length || people.length > LIMITS.people)
    return { error: `people must hold 1 to ${LIMITS.people} entries.` };

  const parsed: Person[] = [];
  for (const [i, entry] of people.entries()) {
    const { name, slices } = (entry ?? {}) as Record<string, unknown>;
    if (typeof name !== "string" || name.length > LIMITS.name) return { error: `people[${i}].name is invalid.` };
    if (!int(slices, LIMITS.slices)) return { error: `people[${i}].slices is out of range.` };
    parsed.push({ id: String(i), name: name.trim(), slices });
  }
  return { totalCents, people: parsed };
}
