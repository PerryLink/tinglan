import { Context } from 'cordis'
import { presencePlugin, type PetDirective } from './index.ts'

const petEl = document.querySelector<HTMLDivElement>('#pet')!
const bubbleEl = document.querySelector<HTMLDivElement>('#bubble')!
const logEl = document.querySelector<HTMLDivElement>('#log')!
const policyEl = document.querySelector<HTMLDivElement>('#policy')!
const quietEl = document.querySelector<HTMLInputElement>('#quiet')!

let offset = 0
const ctx = new Context()
await ctx.plugin(presencePlugin, { now: () => Date.now() + offset })

const logs: string[] = []
function log(line: string) {
  logs.unshift(line)
  logs.length = Math.min(logs.length, 8)
  logEl.textContent = logs.join('\n')
}

let bubbleTimer: ReturnType<typeof setTimeout> | null = null
function render(d: PetDirective) {
  petEl.className = `pose-${d.pose ?? 'idle'}`
  if (d.kind === 'pulse') {
    petEl.classList.add(`pulse-${d.tone ?? 'neutral'}`)
  }
  if (d.kind === 'bubble' && d.text) {
    bubbleEl.textContent = d.text
    bubbleEl.classList.add('show')
    if (bubbleTimer) clearTimeout(bubbleTimer)
    bubbleTimer = setTimeout(() => bubbleEl.classList.remove('show'), d.ttlMs)
  }
  log(`[${d.sourceType}] ${d.kind}${d.text ? ` · ${d.text}` : ''}`)
}

ctx.on('presence/directive', render)

function emit(act: string) {
  const at = Date.now()
  switch (act) {
    case 'due':
      return ctx.presence.ingest({ type: 'commitment.due', at, counts: { due: 3 }, dedupeKey: `due-${at}` })
    case 'brief':
      return ctx.presence.ingest({ type: 'brief.ready', at, counts: { open: 2 }, dedupeKey: `brief-${at}` })
    case 'routine':
      return ctx.presence.ingest({
        type: 'routine.proposed',
        at,
        counts: { pending: 1 },
        dedupeKey: `routine-${at}`,
      })
    case 'done':
      return ctx.presence.ingest({ type: 'commitment.done', at, dedupeKey: `done-${at}` })
    case 'work':
      return ctx.presence.ingest({ type: 'work.state', at, state: 'working' })
    case 'idle':
      return ctx.presence.ingest({ type: 'work.state', at, state: 'idle' })
    case 'secret2':
      return ctx.presence.ingest({
        type: 'commitment.due',
        at,
        counts: { due: 2 },
        secrecy: 2,
        dedupeKey: `secret2-${at}`,
      })
    case 'secret3':
      return ctx.presence.ingest({
        type: 'commitment.due',
        at,
        counts: { due: 2 },
        secrecy: 3,
        dedupeKey: `secret3-${at}`,
      })
  }
}

document.querySelectorAll<HTMLButtonElement>('button[data-act]').forEach((button) => {
  button.addEventListener('click', () => {
    const result = emit(button.dataset.act!)
    if (!result) {
      log(`[dropped] ${button.dataset.act}`)
      updatePolicy()
    }
  })
})

quietEl.addEventListener('change', () => {
  if (quietEl.checked) {
    const target = new Date()
    target.setHours(23, 0, 0, 0)
    offset = target.getTime() - Date.now()
  } else {
    offset = 0
  }
  updatePolicy()
  log(quietEl.checked ? 'clock → 23:00 (quiet)' : 'clock → now')
})

function updatePolicy() {
  const clock = new Date(Date.now() + offset).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })
  policyEl.textContent = `quiet: ${quietEl.checked ? 'on' : 'off'} · clock ${clock}`
}

updatePolicy()
log('ready: Advisers presence projector + cordis service')

// Deterministic screenshot state.
if (new URLSearchParams(location.search).has('auto')) {
  emit('due')
  setTimeout(() => emit('work'), 100)
}

;(window as any).__presence = { ctx, emit, updatePolicy, ready: true }
