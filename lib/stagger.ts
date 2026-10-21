// The sort's stagger slot (contracts/cadence-basis.md, "Table row reorder on
// sort"; decisions/2026-10-21-the-sort-crosses-in-pairs.md). A row waits for
// the top of its move, the smaller of its old and new index, so two rows that
// trade places start together and cross instead of every rising row going
// before any falling one. A row new to the order takes its own index. Capped,
// as every stagger is: slot cap - 1 is the last. Pure.
export function staggerSlot(from: number, to: number, cap: number): number {
  return Math.min(from < 0 ? to : Math.min(from, to), cap - 1)
}
