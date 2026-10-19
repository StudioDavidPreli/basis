import { describe, it, expect } from 'vitest'
import { reduce, initialState, sortIds } from './surface-state'

const ORDER = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']

describe('reduce', () => {
  it('sort cycles asc, desc, off per key', () => {
    let s = initialState('comps', 'level')
    s = reduce(s, { type: 'sort', key: 'level' })
    expect(s.sort).toEqual({ key: 'level', dir: 'asc' })
    s = reduce(s, { type: 'sort', key: 'level' })
    expect(s.sort).toEqual({ key: 'level', dir: 'desc' })
    s = reduce(s, { type: 'sort', key: 'level' })
    expect(s.sort).toBeNull()
    s = reduce(s, { type: 'sort', key: 'change' })
    expect(s.sort).toEqual({ key: 'change', dir: 'asc' })
  })

  it('toggle adds and removes, keeping selection order', () => {
    let s = initialState('comps', 'level')
    s = reduce(s, { type: 'toggle', id: 'c', order: ORDER })
    s = reduce(s, { type: 'toggle', id: 'a', order: ORDER })
    expect(s.selection).toEqual(['c', 'a'])
    s = reduce(s, { type: 'toggle', id: 'c', order: ORDER })
    expect(s.selection).toEqual(['a'])
  })

  it('shift-range selects every row between the anchor and the target in table order', () => {
    let s = initialState('comps', 'level')
    s = reduce(s, { type: 'toggle', id: 'b', order: ORDER })
    s = reduce(s, { type: 'toggle', id: 'e', order: ORDER, range: true })
    expect(s.selection).toEqual(['b', 'c', 'd', 'e'])
    // And deselects a range when the target was already on.
    s = reduce(s, { type: 'toggle', id: 'c', order: ORDER, range: true })
    expect(s.selection).toEqual(['b'])
  })

  it('does not cap the selection; select-all takes every row', () => {
    let s = initialState('comps', 'level')
    for (const id of ORDER) s = reduce(s, { type: 'toggle', id, order: ORDER })
    expect(s.selection).toEqual(ORDER)
    s = reduce(s, { type: 'clear' })
    s = reduce(s, { type: 'selectAll', ids: ORDER })
    expect(s.selection).toEqual(ORDER)
  })

  it('switching dataset clears selection and sort and takes the default metric', () => {
    let s = initialState('comps', 'level')
    s = reduce(s, { type: 'toggle', id: 'a', order: ORDER })
    s = reduce(s, { type: 'sort', key: 'level' })
    s = reduce(s, { type: 'bars', key: 'change' })
    s = reduce(s, { type: 'dataset', dataset: 'regions', defaultMetric: 'index' })
    expect(s).toMatchObject({ dataset: 'regions', metric: 'index', selection: [], sort: null, bars: [] })
  })

  it('a keep box toggles its column, and the sort leaves kept bars alone', () => {
    let s = initialState('comps', 'level')
    s = reduce(s, { type: 'bars', key: 'change' })
    s = reduce(s, { type: 'bars', key: 'multiple' })
    expect(s.bars).toEqual(['change', 'multiple'])
    s = reduce(s, { type: 'sort', key: 'level' })
    expect(s.bars).toEqual(['change', 'multiple'])
    s = reduce(s, { type: 'bars', key: 'change' })
    expect(s.bars).toEqual(['multiple'])
  })

  it('hover is a no-op when unchanged, so it does not churn renders', () => {
    const s = initialState('comps', 'level')
    expect(reduce(s, { type: 'hover', id: null })).toBe(s)
  })
})

describe('sortIds', () => {
  const values: Record<string, number | string | undefined> = { a: 3, b: 1, c: undefined, d: 2 }
  it('sorts numbers, puts missing last, and reverses for desc', () => {
    expect(sortIds(['a', 'b', 'c', 'd'], { key: 'x', dir: 'asc' }, id => values[id])).toEqual(['b', 'd', 'a', 'c'])
    expect(sortIds(['a', 'b', 'c', 'd'], { key: 'x', dir: 'desc' }, id => values[id])).toEqual(['a', 'd', 'b', 'c'])
  })
  it('returns file order with no sort', () => {
    expect(sortIds(['a', 'b'], null, () => 0)).toEqual(['a', 'b'])
  })
})
