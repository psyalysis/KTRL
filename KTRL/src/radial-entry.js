import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow, primaryMonitor } from '@tauri-apps/api/window'
import { openUrl } from '@tauri-apps/plugin-opener'
import { init } from './appShell.js'

const win = getCurrentWindow()
win.setIgnoreCursorEvents(true).catch(() => {})

primaryMonitor().then((monitor) => {
  if (monitor) {
    const pos = monitor.position
    const size = monitor.size
    if (pos && size) {
      win.setPosition(pos).catch(() => {})
      win.setSize(size).catch(() => {})
    }
  }
})

function openExternal(urlOrPath) {
  const s = String(urlOrPath).trim()
  if (/^(https?|mailto|tel):/i.test(s)) return openUrl(s)
  return invoke('open_path_with_default', { path: s }).catch((e) => console.warn('open_path_with_default:', e))
}

window.electronAPI = {
  getMenu: () => invoke('get_menu'),
  getIcon: (id) => invoke('get_icon', { id }).then((v) => v ?? null),
  addUserShortcut: (name, openValue) => invoke('add_user_shortcut', { name: name ?? null, openValue }),
  removeUserShortcut: (openValue) => invoke('remove_user_shortcut', { openValue }),
  removeDefaultShortcut: (action) => invoke('remove_default_shortcut', { action }),
  hideWindowBorder: () => invoke('hide_windows_border').catch(() => {}),
  openExternal,
  onKey: (callback) => {
    const unlisten = listen('ktrl-key', (e) => callback(e.payload))
    return () => { unlisten.then((u) => u()) }
  }
}

init()
window.electronAPI?.hideWindowBorder?.()
