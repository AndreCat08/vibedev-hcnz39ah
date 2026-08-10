import { displayName, formatCents, LIMITS, type Person, type SplitResult } from "../shared/split.ts";
import type { State } from "./state.ts";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const pick = <T extends HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T;

const crew = $<HTMLUListElement>("crew");
const template = $<HTMLTemplateElement>("row");

/** Live rows, keyed by person id, so typing never rebuilds the element underfoot. */
const rows = new Map<string, HTMLLIElement>();

const plural = (n: number) => `${n} ${n === 1 ? "slice" : "slices"} eaten`;

/**
 * Every value that originates with the user is written with `textContent` or
 * `.value` — never innerHTML — so a name like `<img onerror=...>` stays text.
 */
function updateRow(el: HTMLLIElement, person: Person, index: number, share: number) {
  const who = displayName(person, index);
  const name = pick<HTMLInputElement>(el, "[data-name]");
  const slices = pick<HTMLInputElement>(el, "[data-slices]");

  // Assigning to .value resets the caret, so only write when it really changed.
  if (name.value !== person.name) name.value = person.name;
  if (slices.value !== String(person.slices)) slices.value = String(person.slices);
  name.placeholder = `Person ${index + 1}`;

  pick(el, "[data-name-label]").textContent = `Name for person ${index + 1}`;
  pick(el, "[data-slices-label]").textContent = `Slices eaten by ${who}`;
  pick(el, "[data-share]").textContent = formatCents(share);

  const dec = pick<HTMLButtonElement>(el, '[data-act="dec"]');
  const inc = pick<HTMLButtonElement>(el, '[data-act="inc"]');
  const del = pick<HTMLButtonElement>(el, '[data-act="del"]');
  dec.disabled = person.slices === 0;
  inc.disabled = person.slices >= LIMITS.slices;
  dec.ariaLabel = `Remove a slice from ${who}`;
  inc.ariaLabel = `Add a slice for ${who}`;
  del.ariaLabel = `Remove ${who} from the split`;
}

export function render(state: State, billCents: number | null, result: SplitResult, canShare: boolean) {
  const { shares, totalSlices, perSliceCents } = result;
  const totalCents = billCents ?? 0;
  const count = state.people.length;

  for (const [id, el] of rows)
    if (!state.people.some((p) => p.id === id)) {
      el.remove();
      rows.delete(id);
    }

  state.people.forEach((person, i) => {
    let el = rows.get(person.id);
    if (!el) {
      el = template.content.firstElementChild!.cloneNode(true) as HTMLLIElement;
      el.dataset["id"] = person.id;
      rows.set(person.id, el);
    }
    if (crew.children[i] !== el) crew.insertBefore(el, crew.children[i] ?? null);
    updateRow(el, person, i, shares[i] ?? 0);
  });

  $("count").textContent = String(count);
  $("slices").textContent = String(totalSlices);
  $("per-slice").textContent = formatCents(perSliceCents);
  $("total").textContent = formatCents(totalCents);
  $("total-mobile").textContent = formatCents(totalCents);
  $("eaten").textContent = plural(totalSlices);
  $("eaten-mobile").textContent = plural(totalSlices);

  const bill = $<HTMLInputElement>("bill");
  if (bill.value !== state.bill) bill.value = state.bill;
  bill.ariaInvalid = String(billCents === null);
  $("bill-error").hidden = billCents !== null;

  $("empty").hidden = count > 0;
  $("hint").hidden = !(count > 0 && totalSlices === 0);
  $<HTMLButtonElement>("add").disabled = count >= LIMITS.people;
  $<HTMLButtonElement>("fewer").disabled = count === 0;
  $<HTMLButtonElement>("more").disabled = count >= LIMITS.people;

  const share = $<HTMLButtonElement>("share");
  share.disabled = !canShare;
  share.title = canShare ? "" : "Enter a bill total and at least one slice first";
}
