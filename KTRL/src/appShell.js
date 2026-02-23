import { CONFIG } from './config.js'
import { playSound, preloadSounds } from './services/sounds.js'
import { loadIcons, getIcon, iconCache } from './services/icons.js'
import { collectIdsFromNodes } from './menu-state/menuTree.js'
import { buildMenuNodes } from './menu-state/menuTree.js'
import { createMenuHSM } from './menu-state/menuHSM.js'
import { openExternal } from './services/opener.js'
import * as radialView from './radial/radialView.js'
import * as Settings from './Settings.js'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { open as openFileDialog } from '@tauri-apps/plugin-dialog'

let radialContainer
let centerLabel
let isClosing = false
let hsm
let unlistenKey
let hoveredIndex = null
let shortcutRemovalMode = false
let confirmFinish = null
let confirmFocusIndex = 0
let urlFinish = null
let urlFocusIndex = 0

function updateConfirmFocus() {
  const keepBtn = document.getElementById('confirmKeep')
  const deleteBtn = document.getElementById('confirmDelete')
  if (keepBtn) keepBtn.classList.toggle('focused', confirmFocusIndex === 0)
  if (deleteBtn) deleteBtn.classList.toggle('focused', confirmFocusIndex === 1)
}

function showAppConfirm(message, { okLabel = 'Delete', cancelLabel = 'Keep' } = {}) {
  const overlay = document.getElementById('confirmOverlay')
  const msgEl = document.getElementById('confirmMessage')
  const deleteBtn = document.getElementById('confirmDelete')
  const keepBtn = document.getElementById('confirmKeep')
  if (!overlay || !msgEl || !deleteBtn || !keepBtn) return Promise.resolve(false)
  msgEl.textContent = message
  deleteBtn.textContent = okLabel
  keepBtn.textContent = cancelLabel
  confirmFocusIndex = 0
  confirmFinish = null
  updateConfirmFocus()
  radialContainer?.classList.add('menu-hidden')
  overlay.classList.add('visible')
  overlay.setAttribute('aria-hidden', 'false')
  getCurrentWindow().setIgnoreCursorEvents(false).catch(() => {})
  return new Promise((resolve) => {
    const finish = (value) => {
      confirmFinish = null
      overlay.classList.remove('visible')
      overlay.setAttribute('aria-hidden', 'true')
      radialContainer?.classList.remove('menu-hidden')
      getCurrentWindow().setIgnoreCursorEvents(true).catch(() => {})
      deleteBtn.removeEventListener('click', onDelete)
      keepBtn.removeEventListener('click', onKeep)
      resolve(value)
    }
    confirmFinish = finish
    const onDelete = () => finish(true)
    const onKeep = () => finish(false)
    deleteBtn.addEventListener('click', onDelete)
    keepBtn.addEventListener('click', onKeep)
  })
}

function updateUrlFocus() {
  const cancelBtn = document.getElementById('urlCancel')
  const addBtn = document.getElementById('urlAdd')
  if (cancelBtn) cancelBtn.classList.toggle('focused', urlFocusIndex === 0)
  if (addBtn) addBtn.classList.toggle('focused', urlFocusIndex === 1)
}

function showUrlPrompt(message = 'Enter URL', placeholder = 'https://example.com') {
  const overlay = document.getElementById('urlOverlay')
  const msgEl = document.getElementById('urlMessage')
  const inputEl = document.getElementById('urlInput')
  const cancelBtn = document.getElementById('urlCancel')
  const addBtn = document.getElementById('urlAdd')
  if (!overlay || !msgEl || !inputEl || !cancelBtn || !addBtn) return Promise.resolve(null)
  msgEl.textContent = message
  inputEl.placeholder = placeholder
  inputEl.value = ''
  urlFocusIndex = 1
  urlFinish = null
  updateUrlFocus()
  radialContainer?.classList.add('menu-hidden')
  overlay.classList.add('visible')
  overlay.setAttribute('aria-hidden', 'false')
  getCurrentWindow().setIgnoreCursorEvents(false).catch(() => {})
  setTimeout(() => inputEl.focus(), 50)
  return new Promise((resolve) => {
    const finish = (submitAdd) => {
      urlFinish = null
      const value = submitAdd ? inputEl.value.trim() : null
      overlay.classList.remove('visible')
      overlay.setAttribute('aria-hidden', 'true')
      radialContainer?.classList.remove('menu-hidden')
      getCurrentWindow().setIgnoreCursorEvents(true).catch(() => {})
      cancelBtn.removeEventListener('click', onCancel)
      addBtn.removeEventListener('click', onAdd)
      inputEl.removeEventListener('keydown', onKeydown)
      resolve(value || null)
    }
    urlFinish = finish
    const onCancel = () => finish(false)
    const onAdd = () => finish(true)
    const onKeydown = (e) => {
      if (e.key === 'Enter') finish(true)
      else if (e.key === 'Escape') finish(false)
    }
    cancelBtn.addEventListener('click', onCancel)
    addBtn.addEventListener('click', onAdd)
    inputEl.addEventListener('keydown', onKeydown)
  })
}

function getIconFromBackend(id) {
  return window.electronAPI?.getIcon?.(id) ?? Promise.resolve(null)
}

function applySideEffects(sideEffects) {
  if (sideEffects.sound) playSound(sideEffects.sound)
  if (sideEffects.open) openExternal(sideEffects.open)
  if (sideEffects.close) {
    syncSettingsFromState(true)
    isClosing = true
    radialContainer?.classList.add('closing')
    radialContainer?.style.setProperty('pointer-events', 'none')
    const radialMenu = radialContainer?.querySelector('.radial-menu')
    function finishClose() {
      radialContainer?.removeEventListener('transitionend', onClose)
      clearTimeout(fallback)
      isClosing = false
      radialContainer?.classList.remove('open', 'closing')
      radialContainer?.style.removeProperty('pointer-events')
      radialContainer?.setAttribute('aria-hidden', 'true')
      document.body.classList.add('menu-closed')
      hsm?.dispatch('CLOSE')
    }
    function onClose(ev) {
      if (ev.target !== radialMenu) return
      finishClose()
    }
    const fallback = setTimeout(finishClose, CONFIG.CLOSE_FALLBACK_MS)
    radialContainer?.addEventListener('transitionend', onClose)
  }
  if (sideEffects.noAction) {
    centerLabel?.classList.add('no-action', 'wiggle')
    const t = setTimeout(() => {
      centerLabel?.classList.remove('no-action', 'wiggle')
      syncView()
    }, CONFIG.NO_ACTION_RESET_MS)
    return () => clearTimeout(t)
  }
  if (sideEffects.valueClamped) {
    centerLabel?.classList.add('wiggle')
    setTimeout(() => centerLabel?.classList.remove('wiggle'), 220)
  }
}

function syncSettingsFromState(persist = false) {
  const state = hsm?.getState()
  if (!state?.widgetState) return
  for (const [id, value] of Object.entries(state.widgetState)) {
    if (id.startsWith('setting:')) Settings.setFromMenuId(id, value, { persist })
  }
}

function syncView() {
  if (!hsm) return
  const state = hsm.getState()
  const displayState = { ...state, shortcutRemovalMode }
  if (hoveredIndex != null && !state.focusMode && state.items?.[hoveredIndex]) {
    displayState.centerLabel = state.items[hoveredIndex].name ?? state.items[hoveredIndex].label ?? state.centerLabel
  }
  radialView.render(displayState, {
    containerElement: radialContainer,
    centerLabelElement: centerLabel,
    getIcon: (item) => getIcon(item, iconCache),
    iconCache,
    shortcutRemovalMode
  })
}

async function handleAddShortcutFlow(item) {
  const api = window.electronAPI
  if (!api?.addUserShortcut) return
  if (item?.id === 'add-file-shortcut') {
    const pathOrPaths = await openFileDialog({ multiple: true, directory: false })
    const paths = pathOrPaths == null ? [] : Array.isArray(pathOrPaths) ? pathOrPaths : [pathOrPaths]
    for (const p of paths) {
      if (p) await api.addUserShortcut(null, String(p)).catch(() => {})
    }
  } else if (item?.id === 'add-url-shortcut') {
    const url = await showUrlPrompt('Enter URL', 'https://example.com')
    if (url) await api.addUserShortcut(null, url).catch(() => {})
  }
  openMenu()
}

async function handleSelect({ index }) {
  if (isClosing || !hsm) return
  const state = hsm.getState()
  const item = state.items?.[index]

  if (item?.isBack && shortcutRemovalMode) {
    shortcutRemovalMode = false
  }

  if (item?.id === 'remove-shortcut') {
    playSound('Select')
    const result = hsm.dispatch('BACK')
    applySideEffects(result.sideEffects)
    shortcutRemovalMode = true
    syncView()
    return
  }

  if (shortcutRemovalMode && state.nodeId === 'shortcuts' && (item?.url || item?.path)) {
    playSound('Select')
    const deleteIt = await showAppConfirm('Are you sure?', {
      okLabel: 'Delete',
      cancelLabel: 'Keep'
    })
    if (!deleteIt) {
      syncView()
      return
    }
    const isUser = String(item?.id ?? '').startsWith('user-')
    const openValue = item?.open ?? item?.url ?? item?.path
    const action = item?.action ?? item?.id
    if (isUser && openValue) {
      await window.electronAPI?.removeUserShortcut?.(openValue).catch(() => {})
    } else if (action) {
      await window.electronAPI?.removeDefaultShortcut?.(action).catch(() => {})
    }
    openMenu()
    return
  }

  if (item?.id === 'add-file-shortcut' || item?.id === 'add-url-shortcut') {
    playSound('Select')
    const result = hsm.dispatch('CLOSE', { sound: 'Select' })
    applySideEffects(result.sideEffects)
    handleAddShortcutFlow(item)
    return
  }

  const leavingSettings = item?.isBack && state.nodeId === 'settings'
  const result = hsm.dispatch('SELECT', { item })
  applySideEffects(result.sideEffects)
  if (leavingSettings) syncSettingsFromState(true)
  else syncSettingsFromState(false)
  syncView()
}

function handleNavigate(delta) {
  if (isClosing || !hsm) return
  const state = hsm.getState()
  if (state.focusMode === 'value') {
    const result = hsm.dispatch('ADJUST_VALUE', { delta })
    applySideEffects(result.sideEffects)
    syncSettingsFromState(false)
    if (result.sideEffects?.valueBump) {
      centerLabel?.classList.remove('value-bump-up', 'value-bump-down')
      centerLabel?.classList.add(result.sideEffects.valueBump > 0 ? 'value-bump-up' : 'value-bump-down')
      setTimeout(() => {
        centerLabel?.classList.remove('value-bump-up', 'value-bump-down')
      }, 100)
    }
    syncView()
  } else if (state.focusMode === 'dropdown') {
    const result = hsm.dispatch('DROPDOWN_NAVIGATE', { delta })
    applySideEffects(result.sideEffects)
    syncSettingsFromState(false)
    syncView()
  } else {
    const result = hsm.dispatch('NAVIGATE', { delta })
    applySideEffects(result.sideEffects)
    syncView()
  }
}

function handleKey({ id, state: keyState }) {
  if (keyState !== 'down') return
  if (confirmFinish != null) {
    if (id === 'KnL') {
      confirmFocusIndex = 0
      updateConfirmFocus()
      playSound('Backward')
    } else if (id === 'KnR') {
      confirmFocusIndex = 1
      updateConfirmFocus()
      playSound('Forward')
    } else if (id === 'KnC') {
      playSound('Select')
      confirmFinish(confirmFocusIndex === 1)
    }
    return
  }
  if (urlFinish != null) {
    if (id === 'KnL') {
      urlFocusIndex = 0
      updateUrlFocus()
      playSound('Backward')
    } else if (id === 'KnR') {
      urlFocusIndex = 1
      updateUrlFocus()
      playSound('Forward')
    } else if (id === 'KnC') {
      playSound('Select')
      urlFinish(urlFocusIndex === 1)
    }
    return
  }
  if (id === 'KnC') {
    if (isClosing) return
    const menuVisible = radialContainer?.classList.contains('open')
    if (!menuVisible || !hsm) {
      openMenu()
      return
    }
    const s = hsm.getState()
    if (!s.isOpen) {
      openMenu()
      return
    }
    if (s.focusMode === 'value') {
      const result = hsm.dispatch('UNFOCUS_VALUE')
      applySideEffects(result.sideEffects)
      syncSettingsFromState(false)
      syncView()
      return
    }
    if (s.focusMode === 'dropdown') {
      const result = hsm.dispatch('UNFOCUS_DROPDOWN')
      applySideEffects(result.sideEffects)
      syncSettingsFromState(false)
      syncView()
      return
    }
    handleSelect({ index: hoveredIndex != null ? hoveredIndex : s.selectedIndex })
    return
  }
  if (id === 'KnL') {
    if (hsm?.getState()?.isOpen) handleNavigate(-1)
    return
  }
  if (id === 'KnR') {
    if (hsm?.getState()?.isOpen) handleNavigate(1)
    return
  }
}

async function openMenu() {
  let data
  try {
    data = await window.electronAPI?.getMenu?.()
  } catch (_) {
    data = null
  }
  if (!data?.root) {
    radialContainer?.classList.add('open')
    radialContainer?.setAttribute('aria-hidden', 'false')
    document.body.classList.remove('menu-closed')
    if (centerLabel) {
      centerLabel.textContent = 'Cannot load menu'
      centerLabel.classList.add('no-action')
    }
    playSound('Error')
    return
  }
  const { nodes, rootId } = buildMenuNodes(data)
  const ids = collectIdsFromNodes(nodes)
  await loadIcons(ids, getIconFromBackend)
  hsm = createMenuHSM(nodes, rootId, Settings.getAllForMenu())
  shortcutRemovalMode = false
  const result = hsm.dispatch('OPEN')
  applySideEffects(result.sideEffects)
  radialContainer?.classList.remove('closing')
  radialContainer?.classList.add('open')
  radialContainer?.setAttribute('aria-hidden', 'false')
  document.body.classList.remove('menu-closed')
  if (centerLabel) centerLabel.classList.remove('no-action')
  hoveredIndex = null
  syncView()
}

function toggleMenu() {
  if (isClosing) return
  const state = hsm?.getState()
  if (state?.isOpen) {
    const result = hsm.dispatch('CLOSE')
    applySideEffects(result.sideEffects)
  } else {
    openMenu()
  }
}

export function init() {
  radialContainer = document.getElementById('radial')
  centerLabel = document.getElementById('centerLabel')

  Settings.apply()
  preloadSounds()

  radialView.attachListeners(radialContainer, () => hsm?.getState())
  radialView.on('select', (data) => handleSelect(data))
  radialView.on('hover', (data) => {
    hoveredIndex = data.index
    if (!hsm) return
    syncView()
  })

  if (window.electronAPI?.onKey) {
    unlistenKey = window.electronAPI.onKey(handleKey)
  }

  document.addEventListener('ktrl-key', (e) => handleKey(e.detail))
}
