import { test } from "node:test";
import assert from "node:assert/strict";
import { allocate, computeSplit, LIMITS, parseMoneyToCents, parseSplitInput } from "./split.ts";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const crew = (...slices: number[]) => slices.map((s, i) => ({ id: `${i}`, name: "", slices: s }));

test("allocate never invents or loses a cent", () => {
  let seed = 12345;
  const rand = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);
  for (let i = 0; i < 2000; i++) {
    const total = rand(500_000);
    const slices = Array.from({ length: 1 + rand(12) }, () => rand(15));
    const shares = allocate(total, slices);
    assert.equal(sum(shares), sum(slices) === 0 ? 0 : total, `total=${total} slices=${slices}`);
    assert.ok(shares.every((s) => s >= 0));
  }
});

test("the case the reference mockup gets wrong", () => {
  // code.html rounds each share independently and yields $45.01 for this input.
  const { shares, totalSlices, perSliceCents } = computeSplit({ totalCents: 4500, people: crew(3, 4, 1) });
  assert.deepEqual([totalSlices, perSliceCents, sum(shares)], [8, 562.5, 4500]);
});

test("edge cases", () => {
  const zero = computeSplit({ totalCents: 4500, people: crew(0, 0) });
  assert.deepEqual(zero.shares, [0, 0]);
  assert.equal(zero.perSliceCents, 0, "no division by zero");
  assert.equal(computeSplit({ totalCents: 3000, people: crew(2, 0, 1) }).shares[1], 0, "ate nothing, owes nothing");
  assert.deepEqual(computeSplit({ totalCents: 4500, people: [] }).shares, []);
  assert.deepEqual(computeSplit({ totalCents: 4500, people: crew(7) }).shares, [4500], "one person takes it all");
  assert.deepEqual(computeSplit({ totalCents: 0, people: crew(1, 2) }).shares, [0, 0]);
  assert.equal(sum(allocate(1, [1, 1, 1])), 1, "an indivisible cent still lands");
});

test("bigger eaters owe more", () => {
  const { shares } = computeSplit({ totalCents: 10_000, people: crew(1, 5, 3) });
  assert.ok(shares[1]! > shares[2]! && shares[2]! > shares[0]!);
});

test("parseMoneyToCents", () => {
  assert.deepEqual(
    ["45", "45.5", " $1,234.56 ", ""].map(parseMoneyToCents),
    [4500, 4550, 123456, 0],
    "empty means zero, not invalid",
  );
  for (const bad of ["abc", "-5", "1e308", "45.555", "4 5", "NaN", "Infinity", "1000000.01"])
    assert.equal(parseMoneyToCents(bad), null, `expected ${bad} to be rejected`);
});

test("parseSplitInput accepts a good body and trims the name", () => {
  assert.deepEqual(parseSplitInput({ totalCents: 4500, people: [{ name: "  Sarah  ", slices: 3 }] }), {
    totalCents: 4500,
    people: [{ id: "0", name: "Sarah", slices: 3 }],
  });
});

test("parseSplitInput rejects every malformed body", () => {
  const ok = { name: "a", slices: 1 };
  for (const body of [
    null,
    "not an object",
    { totalCents: 4500 },
    { totalCents: -1, people: [ok] },
    { totalCents: 1.5, people: [ok] },
    { totalCents: LIMITS.totalCents + 1, people: [ok] },
    { totalCents: 1, people: [] },
    { totalCents: 1, people: Array(LIMITS.people + 1).fill(ok) },
    { totalCents: 1, people: [null] },
    { totalCents: 1, people: [{ name: "x".repeat(LIMITS.name + 1), slices: 1 }] },
    { totalCents: 1, people: [{ name: 42, slices: 1 }] },
    { totalCents: 1, people: [{ name: "a", slices: -1 }] },
    { totalCents: 1, people: [{ name: "a", slices: 1.5 }] },
    { totalCents: 1, people: [{ name: "a", slices: LIMITS.slices + 1 }] },
    { totalCents: 1, people: [{ name: "a", slices: "3" }] },
  ] as unknown[])
    assert.ok("error" in parseSplitInput(body), `expected rejection for ${JSON.stringify(body)}`);
});
