import { CONFIG } from '../config.js'
import { get as getSetting } from '../Settings.js'

const SOUNDS = {}

export function playSound(name) {
  if (!getSetting('sound_enabled')) return
  if (!SOUNDS[name]) SOUNDS[name] = new Audio(`/assets/sounds/${name}.wav`)
  const a = SOUNDS[name]
  a.currentTime = 0
  a.play().catch(() => {})
}

export function preloadSounds() {
  CONFIG.SOUND_NAMES.forEach((name) => {
    if (!SOUNDS[name]) SOUNDS[name] = new Audio(`/assets/sounds/${name}.wav`)
  })
}
