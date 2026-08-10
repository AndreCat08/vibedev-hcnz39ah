import { clampSlices, LIMITS, type Person } from "../shared/split.ts";

/** The bill stays the raw typed string so half-finished input like "45." survives a keystroke. */
export type State = { bill: string; people: Person[] };

export type Action =
  | { type: "bill"; bill: string }
  | { type: "add" }
  | { type: "remove"; id: string }
  | { type: "count"; count: number }
  | { type: "name"; id: string; name: string }
  | { type: "slices"; id: string; slices: number }
  | { type: "step"; id: string; delta: number }
  | { type: "reset" };

let seq = 0;
const newPerson = (): Person => ({ id: `p${++seq}`, name: "", slices: 0 });
export const initialState = (): State => ({ bill: "", people: [newPerson(), newPerson()] });

const mapPerson = (s: State, id: string, fn: (p: Person) => Person): State => ({
  ...s,
  people: s.people.map((p) => (p.id === id ? fn(p) : p)),
});

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "bill":
      return { ...state, bill: action.bill };
    case "add":
      return state.people.length >= LIMITS.people ? state : { ...state, people: [...state.people, newPerson()] };
    case "remove":
      return { ...state, people: state.people.filter((p) => p.id !== action.id) };
    case "count": {
      // "Number of people at the table" from the brief. Grows by appending
      // blanks, shrinks from the end, so existing entries keep their data.
      const n = Math.max(0, Math.min(LIMITS.people, Math.floor(action.count) || 0));
      const people = state.people.slice(0, n);
      while (people.length < n) people.push(newPerson());
      return { ...state, people };
    }
    case "name":
      return mapPerson(state, action.id, (p) => ({ ...p, name: action.name.slice(0, LIMITS.name) }));
    case "slices":
      return mapPerson(state, action.id, (p) => ({ ...p, slices: clampSlices(action.slices) }));
    case "step":
      return mapPerson(state, action.id, (p) => ({ ...p, slices: clampSlices(p.slices + action.delta) }));
    case "reset":
      return initialState();
  }
}

const KEY = "slicesplitter:v1";

/** localStorage is user-writable, so restored state is re-validated like any other untrusted input. */
export function restoreState(): State {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "") as Partial<State>;
    if (typeof saved.bill === "string" && Array.isArray(saved.people) && saved.people.length)
      return {
        bill: saved.bill.slice(0, 20),
        people: saved.people.slice(0, LIMITS.people).map((p: Partial<Person>) => ({
          ...newPerson(),
          name: String(p?.name ?? "").slice(0, LIMITS.name),
          slices: clampSlices(p?.slices),
        })),
      };
  } catch {
    /* absent, corrupt, or unavailable storage just means a fresh start */
  }
  return initialState();
}

export function saveState(state: State): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* private mode or quota — persistence is a nicety, not a requirement */
  }
}
