import { describe, it, expect } from 'vitest'
import { encodeUrlState, mergeUrlSearch, parseUrlState, type UrlState } from './surface-url'

const bare: UrlState = { dataset: 'comps', sort: null, metric: 'level', range: '1Y' }

describe('the URL codec', () => {
  it('parses nothing as the defaults and encodes the defaults as nothing', () => {
    expect(parseUrlState({})).toEqual(bare)
    expect(parseUrlState(new URLSearchParams())).toEqual(bare)
    expect(encodeUrlState(bare)).toBe('')
  })

  it('round-trips every field', () => {
    const state: UrlState = { dataset: 'regions', sort: { key: 'change', dir: 'desc' }, metric: 'change', range: '5Y' }
    const qs = encodeUrlState(state)
    expect(qs).toBe('?dataset=regions&sort=change&dir=desc&metric=change&range=5Y')
    expect(parseUrlState(new URLSearchParams(qs))).toEqual(state)
  })

  it('omits an ascending dir, the default metric of the dataset, and the default range', () => {
    expect(encodeUrlState({ ...bare, sort: { key: 'name', dir: 'asc' } })).toBe('?sort=name')
    expect(encodeUrlState({ dataset: 'regions', sort: null, metric: 'index', range: '1Y' })).toBe('?dataset=regions')
  })

  it('falls back on unknown values instead of throwing', () => {
    expect(parseUrlState({ dataset: 'nope', sort: 'nope', dir: 'sideways', metric: 'nope', range: '9Y' })).toEqual(bare)
    // A metric or sort key from the other dataset is unknown here.
    expect(parseUrlState({ dataset: 'regions', metric: 'multiple', sort: 'multiple' })).toEqual({ dataset: 'regions', sort: null, metric: 'index', range: '1Y' })
    // The driver column is sortable but not chartable.
    expect(parseUrlState({ dataset: 'regions', metric: 'driver', sort: 'driver' })).toEqual({ dataset: 'regions', sort: { key: 'driver', dir: 'asc' }, metric: 'index', range: '1Y' })
  })

  it('ignores repeated params and treats dir without sort as nothing', () => {
    expect(parseUrlState({ sort: ['level', 'change'], dir: 'desc' })).toEqual(bare)
  })

  it('keeps the keys it does not own when it writes', () => {
    // The reduce and theme overrides belong to the inline script.
    expect(mergeUrlSearch('?reduce=1&theme=operate', '')).toBe('?reduce=1&theme=operate')
    expect(mergeUrlSearch('?reduce=1', '?sort=name')).toBe('?reduce=1&sort=name')
    // Its own keys are replaced, not accumulated, and dropped when back at
    // the default.
    expect(mergeUrlSearch('?sort=level&dir=desc&reduce=1', '?sort=name')).toBe('?reduce=1&sort=name')
    expect(mergeUrlSearch('?sort=level&dir=desc', '')).toBe('')
    expect(mergeUrlSearch('', '')).toBe('')
  })
})
