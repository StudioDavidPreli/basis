// The one reducer (docs/spec.md, "State"). Table and chart read it; neither
// calls the other. Pure and tested; the component that holds it is
// surface.tsx. Range, dataset, metric, and sort mirror to the URL through
// the codec in surface-url.ts.

export type SortDir = 'asc' | 'desc'
export type Sort = { key: string; dir: SortDir } | null
export type Range = '1M' | '3M' | '1Y' | '5Y' | 'Max'
export const RANGES: Range[] = ['1M', '3M', '1Y', '5Y', 'Max']
export const DEFAULT_RANGE: Range = '3M' // decisions/2026-10-15-the-chart-lands-on-3m.md

export type Window = { from: string; to: string } // ISO dates, inclusive; the analysis window (docs/spec.md, Diagnostics)

export type SurfaceState = {
  dataset: string
  sort: Sort
  bars: string[] // figure columns whose bars stay whatever the sort (decisions/2026-10-19-bars-can-be-kept.md)
  selection: string[] // entity ids, in selection order (the legend order)
  hoveredId: string | null
  metric: string
  range: Range
  window: Window | null // null: follows the view
  tool: string | null // the pinned diagnostics tool
  anchorId: string | null // the last row toggled, for Shift-range selection
}

// The chart draws this many; the selection itself is not capped (David,
// 2026-09-16: select-all selects all). The first CHART_CAP selected rows are
// charted, the rest wait, and the legend says so.
export const CHART_CAP = 8

export type SurfaceAction =
  | { type: 'dataset'; dataset: string; defaultMetric: string }
  | { type: 'sort'; key: string }
  | { type: 'bars'; key: string }
  | { type: 'toggle'; id: string; order: string[]; range?: boolean }
  | { type: 'selectAll'; ids: string[] }
  | { type: 'clear' }
  | { type: 'hover'; id: string | null }
  | { type: 'metric'; metric: string }
  | { type: 'range'; range: Range }
  | { type: 'window'; window: Window | null }
  | { type: 'tool'; tool: string | null }

export function initialState(dataset: string, metric: string): SurfaceState {
  return { dataset, sort: null, bars: [], selection: [], hoveredId: null, metric, range: DEFAULT_RANGE, window: null, tool: null, anchorId: null }
}

export function reduce(state: SurfaceState, action: SurfaceAction): SurfaceState {
  switch (action.type) {
    case 'dataset':
      if (action.dataset === state.dataset) return state
      // A new dataset is a new set of ids and columns: selection, sort, and
      // kept bars do not carry.
      return { ...state, dataset: action.dataset, metric: action.defaultMetric, selection: [], sort: null, bars: [], anchorId: null, hoveredId: null }
    case 'sort': {
      // asc, then desc, then off: the third click clears the sort.
      if (!state.sort || state.sort.key !== action.key) return { ...state, sort: { key: action.key, dir: 'asc' } }
      if (state.sort.dir === 'asc') return { ...state, sort: { key: action.key, dir: 'desc' } }
      return { ...state, sort: null }
    }
    case 'bars':
      return { ...state, bars: state.bars.includes(action.key) ? state.bars.filter(k => k !== action.key) : [...state.bars, action.key] }
    case 'toggle': {
      const selected = new Set(state.selection)
      if (action.range && state.anchorId && state.anchorId !== action.id) {
        // Shift-range: every row between the anchor and this one, in the
        // table's current order, takes this row's new state.
        const a = action.order.indexOf(state.anchorId)
        const b = action.order.indexOf(action.id)
        if (a >= 0 && b >= 0) {
          const [from, to] = a < b ? [a, b] : [b, a]
          const turningOn = !selected.has(action.id)
          for (const id of action.order.slice(from, to + 1)) {
            if (turningOn) selected.add(id)
            else selected.delete(id)
          }
        }
      } else if (selected.has(action.id)) selected.delete(action.id)
      else selected.add(action.id)
      // Selection order is legend order: what was already selected keeps
      // its order, what a range adds arrives in table order, newest last.
      const kept = state.selection.filter(id => selected.has(id))
      const added = action.order.filter(id => selected.has(id) && !state.selection.includes(id))
      return { ...state, selection: [...kept, ...added], anchorId: action.id }
    }
    case 'selectAll':
      return { ...state, selection: [...action.ids], anchorId: null }
    case 'clear':
      return { ...state, selection: [], anchorId: null }
    case 'hover':
      return state.hoveredId === action.id ? state : { ...state, hoveredId: action.id }
    case 'metric':
      return { ...state, metric: action.metric }
    case 'range':
      // The window is about the data, not the view: it survives.
      return { ...state, range: action.range }
    case 'window':
      return { ...state, window: action.window }
    case 'tool':
      return state.tool === action.tool ? state : { ...state, tool: action.tool }
  }
}

// The sorted order of ids for a dataset, given a value reader. Stable: ties
// keep file order. Strings sort by locale, numbers by value, missing last.
export function sortIds(ids: string[], sort: Sort, read: (id: string) => number | string | undefined): string[] {
  if (!sort) return ids
  const dir = sort.dir === 'asc' ? 1 : -1
  return [...ids].sort((a, b) => {
    const va = read(a)
    const vb = read(b)
    if (va === undefined && vb === undefined) return 0
    if (va === undefined) return 1
    if (vb === undefined) return -1
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
    return String(va).localeCompare(String(vb)) * dir
  })
}
