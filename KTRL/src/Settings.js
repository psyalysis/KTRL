/**
 * App settings: app_opacity, app_size, sound_enabled.
 * Persisted to localStorage; applied to DOM and used by sounds.
 */

const STORAGE_KEY = 'ktrl-settings'

const DEFAULTS = {
  app_opacity: 80,
  app_size: 60,
  sound_enabled: true,
  app_alignment: 'center'
}

const MENU_ID_TO_KEY = {
  'setting:sound_enabled': 'sound_enabled',
  'setting:app_size': 'app_size',
  'setting:app_opacity': 'app_opacity',
  'setting:app_alignment': 'app_alignment'
}

const ALIGNMENT_OPTIONS = ['left', 'center', 'right']
const alignmentToIndex = (v) => Math.max(0, ALIGNMENT_OPTIONS.indexOf(String(v)))
const indexToAlignment = (i) => ALIGNMENT_OPTIONS[Math.min(2, Math.max(0, Number(i)))] ?? 'center'

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw)
    return {
      app_opacity: clamp(Number(parsed.app_opacity), 0, 100) || DEFAULTS.app_opacity,
      app_size: clamp(Number(parsed.app_size), 0, 100) || DEFAULTS.app_size,
      sound_enabled: typeof parsed.sound_enabled === 'boolean' ? parsed.sound_enabled : DEFAULTS.sound_enabled,
      app_alignment: ALIGNMENT_OPTIONS.includes(parsed.app_alignment) ? parsed.app_alignment : DEFAULTS.app_alignment
    }
  } catch {
    return { ...DEFAULTS }
  }
}

function clamp(n, min, max) {
  if (Number.isNaN(n)) return undefined
  return Math.min(max, Math.max(min, n))
}

let cache = load()

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
  } catch (_) {}
}

export function get(key) {
  return cache[key]
}

export function set(key, value, { persist = true } = {}) {
  if (!(key in DEFAULTS)) return
  if (key === 'sound_enabled') {
    cache.sound_enabled = Boolean(value)
  } else if (key === 'app_alignment') {
    cache.app_alignment = indexToAlignment(value)
  } else {
    const n = clamp(Number(value), 0, 100)
    if (n === undefined) return
    cache[key] = n
  }
  if (persist) save()
  apply()
}

/** Map menu item id (e.g. setting:sound_enabled) to setting key and set. */
export function setFromMenuId(menuId, value, options = {}) {
  const key = MENU_ID_TO_KEY[menuId]
  if (key) set(key, value, options)
}

export function getAll() {
  return { ...cache }
}

/** Values for HSM initial widget state (menu item id → value). */
export function getAllForMenu() {
  return {
    'setting:sound_enabled': cache.sound_enabled,
    'setting:app_size': cache.app_size,
    'setting:app_opacity': cache.app_opacity,
    'setting:app_alignment': alignmentToIndex(cache.app_alignment)
  }
}

const JUSTIFY = { left: 'flex-start', center: 'center', right: 'flex-end' }

export function apply() {
  const root = document.documentElement
  const scale = 0.5 + (cache.app_size / 100) * 0.9
  root.style.setProperty('--app-scale', String(scale))
  root.style.setProperty('--app-opacity', String(cache.app_opacity / 100))
  root.style.setProperty('--app-justify', JUSTIFY[cache.app_alignment] ?? 'center')
}
