import type { SplitInput, SplitResult } from "../shared/split.ts";

/** Asks the server to recompute shares from the same engine, so the numbers
 *  copied for sharing are never just whatever the client's own JS produced. */
export async function verifySplit(input: SplitInput): Promise<SplitResult> {
  let res: Response;
  try {
    res = await fetch("/api/split", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    throw new Error("Can't reach the server — check your connection and try again.");
  }
  const body = await res.json().catch(() => ({}) as { error?: string });
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${res.status}).`);
  return body as SplitResult;
}
