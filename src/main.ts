import "./index.css";
import { computeSplit, displayName, formatCents, parseMoneyToCents } from "../shared/split.ts";
import { verifySplit } from "./api.ts";
import { reducer, restoreState, saveState, type Action, type State } from "./state.ts";
import { render } from "./render.ts";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

let state: State = restoreState();
let canShare = false;

function update() {
  const billCents = parseMoneyToCents(state.bill);
  const result = computeSplit({ totalCents: billCents ?? 0, people: state.people });
  canShare = billCents !== null && billCents > 0 && result.totalSlices > 0;
  render(state, billCents, result, canShare);
}

function dispatch(action: Action) {
  state = reducer(state, action);
  saveState(state);
  update();
}

let toastTimer: ReturnType<typeof setTimeout>;
function toast(message: string, tone: "ok" | "bad") {
  const el = $("toast");
  el.textContent = message;
  el.classList.toggle("bg-inverse-surface", tone === "ok");
  el.classList.toggle("text-inverse-on-surface", tone === "ok");
  el.classList.toggle("bg-error-container", tone === "bad");
  el.classList.toggle("text-on-error-container", tone === "bad");
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 5000);
}

$("bill").addEventListener("input", (e) => dispatch({ type: "bill", bill: (e.target as HTMLInputElement).value }));
$("more").addEventListener("click", () => dispatch({ type: "count", count: state.people.length + 1 }));
$("fewer").addEventListener("click", () => dispatch({ type: "count", count: state.people.length - 1 }));
$("add").addEventListener("click", () => dispatch({ type: "add" }));

$("reset").addEventListener("click", () => {
  const dirty = state.bill !== "" || state.people.some((p) => p.name || p.slices);
  if (dirty && !confirm("Clear this split and start a new one?")) return;
  dispatch({ type: "reset" });
});

// One delegated listener per event type, rather than a set per row.
const rowId = (e: Event) => (e.target as HTMLElement).closest<HTMLLIElement>("li[data-id]")?.dataset["id"];

$("crew").addEventListener("click", (e) => {
  const act = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-act]")?.dataset["act"];
  const id = rowId(e);
  if (!act || !id) return;
  if (act === "del") dispatch({ type: "remove", id });
  else dispatch({ type: "step", id, delta: act === "inc" ? 1 : -1 });
});

$("crew").addEventListener("input", (e) => {
  const el = e.target as HTMLInputElement;
  const id = rowId(e);
  if (!id) return;
  if (el.hasAttribute("data-name")) dispatch({ type: "name", id, name: el.value });
  else if (el.hasAttribute("data-slices")) dispatch({ type: "slices", id, slices: el.valueAsNumber });
});

// The client never trusts its own arithmetic for what gets shared: the totals
// copied here come back from the server's recomputation, not the DOM.
$("share").addEventListener("click", async () => {
  if (!canShare) return;
  $<HTMLButtonElement>("share").disabled = true;
  $("share-label").textContent = "Verifying…";
  try {
    const input = {
      totalCents: parseMoneyToCents(state.bill) ?? 0,
      people: state.people.map((p, i) => ({ id: String(i), name: p.name.trim(), slices: p.slices })),
    };
    const { shares } = await verifySplit(input);
    const lines = input.people.map((p, i) => `${displayName(p, i)}: ${formatCents(shares[i] ?? 0)}`);
    const summary = `${lines.join("\n")}\nTotal: ${formatCents(input.totalCents)}`;
    const copied = await navigator.clipboard.writeText(summary).then(() => true, () => false);
    toast(copied ? "Split summary copied to your clipboard." : summary, "ok");
  } catch (error) {
    toast((error as Error).message, "bad");
  } finally {
    $("share-label").textContent = "Share Split";
    update();
  }
});

update();
