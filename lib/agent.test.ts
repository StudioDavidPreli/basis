import { describe, it, expect } from 'vitest'
import { agentPhase, agentProgress, IDLE_AFTER_MS } from './agent'
import { AGENT_PHASES, type AgentState } from '@/worker/refresh'

const NOW = new Date('2026-09-16T16:30:00Z')

function agent(over: Partial<AgentState> = {}): AgentState {
  return {
    phase: 'done',
    progress: 1,
    startedAt: '2026-09-16T16:29:55Z',
    finishedAt: NOW.toISOString(),
    lastSuccessAt: NOW.toISOString(),
    interruption: null,
    ...over,
  }
}

function ago(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString()
}

describe('agentPhase', () => {
  it('a refresh this client started reads as reading, whatever is stored', () => {
    expect(agentPhase(agent(), NOW, true)).toBe('reading')
    expect(agentPhase(agent({ phase: 'waiting' }), NOW, true)).toBe('reading')
    expect(agentPhase(agent({ phase: 'error' }), NOW, true)).toBe('reading')
    expect(agentPhase(null, NOW, true)).toBe('reading')
  })

  it('no snapshot at all is idle', () => {
    expect(agentPhase(null, NOW, false)).toBe('idle')
  })

  it('done ages into idle at IDLE_AFTER, not before', () => {
    expect(agentPhase(agent({ finishedAt: ago(0) }), NOW, false)).toBe('done')
    expect(agentPhase(agent({ finishedAt: ago(IDLE_AFTER_MS - 1000) }), NOW, false)).toBe('done')
    expect(agentPhase(agent({ finishedAt: ago(IDLE_AFTER_MS) }), NOW, false)).toBe('idle')
    expect(agentPhase(agent({ finishedAt: ago(IDLE_AFTER_MS * 12) }), NOW, false)).toBe('idle')
  })

  it('waiting and error never age out: a reader has something to do about both', () => {
    const old = ago(IDLE_AFTER_MS * 12)
    expect(agentPhase(agent({ phase: 'waiting', finishedAt: old }), NOW, false)).toBe('waiting')
    expect(agentPhase(agent({ phase: 'error', finishedAt: old }), NOW, false)).toBe('error')
  })

  it('a run caught mid-flight by the poll passes through', () => {
    expect(agentPhase(agent({ phase: 'reading', progress: 0, finishedAt: null }), NOW, false)).toBe('reading')
    expect(agentPhase(agent({ phase: 'building', finishedAt: null }), NOW, false)).toBe('building')
  })

  it('a done with no finishedAt stays done rather than claiming five minutes passed', () => {
    expect(agentPhase(agent({ finishedAt: null }), NOW, false)).toBe('done')
  })

  it('a clock behind the run keeps it done rather than going negative into idle', () => {
    expect(agentPhase(agent({ finishedAt: new Date(NOW.getTime() + 60_000).toISOString() }), NOW, false)).toBe('done')
  })
})

describe('agentProgress', () => {
  it('is 0 while reading and 1 from building on, for every phase', () => {
    expect(agentProgress('reading')).toBe(0)
    for (const phase of AGENT_PHASES.filter(p => p !== 'reading')) {
      expect(agentProgress(phase)).toBe(1)
    }
  })

  it('is never a fraction: a phase carries one of two values, whatever is added later', () => {
    expect(new Set(AGENT_PHASES.map(agentProgress))).toEqual(new Set([0, 1]))
  })
})
