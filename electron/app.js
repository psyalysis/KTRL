const el = document.getElementById('command')
const radial = document.getElementById('radial')
const radialMenu = document.getElementById('radialMenu')
const centerLabel = document.getElementById('centerLabel')

// ——— Constants ———
const CONFIG = {
  RADIUS: 130,
  CENTER: 200,
  MAX_VISIBLE_ITEMS: 6,
  CLOSE_FALLBACK_MS: 250,
  NO_ACTION_RESET_MS: 900,
  SOUND_NAMES: ['Open', 'Close', 'Select', 'SubmenuIn', 'SubmenuOut', 'Forward', 'Backward', 'error']
}
const RADIUS = CONFIG.RADIUS
const CENTER = CONFIG.CENTER
const use_Icons = true

let menuOpen = false
let selectedIndex = 0
let hoveredIndex = null
let isClosing = false
let menuStack = []
let ROOT_ITEMS = []
let iconCache = {}
let cachedMenu = null

const SOUNDS = {}
function playSound(name) {
  if (!SOUNDS[name]) SOUNDS[name] = new Audio(`assets/sounds/${name}.wav`)
  const a = SOUNDS[name]
  a.currentTime = 0
  a.play().catch(() => {})
}

function preloadSounds() {
  CONFIG.SOUND_NAMES.forEach((name) => {
    if (!SOUNDS[name]) SOUNDS[name] = new Audio(`assets/sounds/${name}.wav`)
  })
}

const FALLBACK_ICONS = {
  close: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>',
  ellipsis: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="6" cy="12" r="1.5" stroke="currentColor" stroke-width="2.5" fill="none"/><circle cx="12" cy="12" r="1.5" stroke="currentColor" stroke-width="2.5" fill="none"/><circle cx="18" cy="12" r="1.5" stroke="currentColor" stroke-width="2.5" fill="none"/></svg>',
  settings: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><line x1="4" y1="6" x2="20" y2="6" stroke-width="2.5"/><line x1="4" y1="12" x2="20" y2="12" stroke-width="2.5"/><line x1="4" y1="18" x2="20" y2="18" stroke-width="2.5"/><circle cx="8" cy="6" r="1.5" stroke="currentColor" stroke-width="2.5" fill="none"/><circle cx="16" cy="12" r="1.5" stroke="currentColor" stroke-width="2.5" fill="none"/><circle cx="12" cy="18" r="1.5" stroke="currentColor" stroke-width="2.5" fill="none"/></svg>',
  presets: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M4 6h16M4 12h16M4 18h7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><path d="M14 18l3-3-3-3" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  back: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M10.7071 7.70711C11.0976 7.31658 11.0976 6.68342 10.7071 6.29289C10.3166 5.90237 9.68342 5.90237 9.29289 6.29289L4.29289 11.2929C3.90237 11.6834 3.90237 12.3166 4.29289 12.7071L9.29289 17.7071C9.68342 18.0976 10.3166 18.0976 10.7071 17.7071C11.0976 17.3166 11.0976 16.6834 10.7071 16.2929L7.41422 13L19 13C19.5523 13 20 12.5523 20 12C20 11.4477 19.5523 11 19 11L7.41421 11L10.7071 7.70711Z" fill="currentColor"/></svg>'
}

function sanitizeIcon(svgString) {
  if (typeof svgString !== 'string') return ''
  return svgString
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '')
    .trim()
}

function setIconSafe(container, svgString) {
  const safe = sanitizeIcon(svgString)
  let wrap = container.querySelector('.radial-item-icon')
  if (!wrap) {
    wrap = document.createElement('span')
    wrap.className = 'radial-item-icon'
    container.appendChild(wrap)
  }
  wrap.innerHTML = safe
}

function collectIds(items) {
  const ids = new Set()
  function walk(arr) {
    if (!arr) return
    for (const item of arr) {
      if (item.action) ids.add(item.action)
      if (item.icon) ids.add(item.icon)
      if (item.children) walk(item.children)
    }
  }
  walk(items)
  return ids
}

async function loadIcons(ids) {
  if (!window.electronAPI?.getIcon) return
  const loads = [...ids].map(async (id) => {
    try {
      const svg = await window.electronAPI.getIcon(id)
      if (svg) iconCache[id] = svg
    } catch (_) {}
  })
  await Promise.allSettled(loads)
}

function getIcon(item) {
  const id = item.icon || item.action
  return iconCache[id] || FALLBACK_ICONS[id] || FALLBACK_ICONS.ellipsis
}

function getCurrentItems() {
  const items = menuStack.length === 0 ? ROOT_ITEMS : menuStack[menuStack.length - 1].items
  const inSubmenu = menuStack.length > 0
  return inSubmenu ? [...items, { action: 'back', name: 'Back', icon: 'back', isBack: true }] : items
}

function getDisplayName(item) {
  return item?.name ?? item?.label ?? ''
}

function runAction(item) {
  return typeof window.runActionFromRegistry === 'function' && window.runActionFromRegistry(item)
}

function hasAction(item) {
  return typeof window.hasActionFromRegistry === 'function' && window.hasActionFromRegistry(item)
}

function dispatchKey(id, state) {
  document.dispatchEvent(new CustomEvent('ktrl-key', { detail: { id, state } }))
}

function positionItems() {
  let items = getCurrentItems()
  if (items.length > CONFIG.MAX_VISIBLE_ITEMS) items = items.slice(0, CONFIG.MAX_VISIBLE_ITEMS)
  const count = items.length
  const step = (2 * Math.PI) / count
  const angles = Array.from({ length: count }, (_, i) => -Math.PI / 2 + step * i)
  const existing = radialMenu.querySelectorAll('.radial-item')

  items.forEach((item, i) => {
    let node = existing[i]
    if (!node) {
      node = document.createElement('div')
      node.className = 'radial-item' + (use_Icons ? ' radial-item--icon' : ' radial-item--text')
      radialMenu.appendChild(node)
    }
    const angle = angles[i]
    const x = CENTER + RADIUS * Math.cos(angle)
    const y = CENTER + RADIUS * Math.sin(angle)
    node.style.left = x + 'px'
    node.style.top = y + 'px'
    node.dataset.index = String(i)
    node.setAttribute('aria-label', getDisplayName(item))
    node.classList.toggle('no-action-item', !hasAction(item))
    if (use_Icons) {
      setIconSafe(node, getIcon(item))
    } else {
      const textEl = node.querySelector('.radial-item-text') || (() => {
        const t = document.createElement('span')
        t.className = 'radial-item-text'
        node.appendChild(t)
        return t
      })()
      textEl.textContent = getDisplayName(item)
    }
  })
  while (radialMenu.querySelectorAll('.radial-item').length > count) {
    const list = radialMenu.querySelectorAll('.radial-item')
    list[list.length - 1].remove()
  }
  updateSelection()
}

radialMenu.addEventListener('mouseenter', (e) => {
  const itemEl = e.target.closest('.radial-item')
  if (!itemEl) return
  const i = parseInt(itemEl.dataset.index, 10)
  if (!Number.isNaN(i)) {
    hoveredIndex = i
    const items = getCurrentItems()
    updateCenterContent(items[i] || null)
  }
}, true)
radialMenu.addEventListener('mouseleave', (e) => {
  if (!e.target.closest('.radial-menu')) return
  const itemEl = e.relatedTarget?.closest('.radial-item')
  if (!itemEl) {
    hoveredIndex = null
    const items = getCurrentItems()
    updateCenterContent(items[selectedIndex] || null)
  }
}, true)
radialMenu.addEventListener('click', (e) => {
  const itemEl = e.target.closest('.radial-item')
  if (!itemEl) return
  const i = parseInt(itemEl.dataset.index, 10)
  if (Number.isNaN(i)) return
  const items = getCurrentItems()
  const item = items[i]
  if (item) handleItemClick(item, i)
}, true)

function updateCenterContent(item) {
  if (!centerLabel) return
  const centerEl = centerLabel.closest('.radial-center')
  if (use_Icons) {
    centerEl?.classList.remove('radial-center--icon')
    centerLabel.textContent = item ? getDisplayName(item) : 'Menu'
  } else {
    centerEl?.classList.add('radial-center--icon')
    const html = item ? getIcon(item) : getIcon({ action: 'ellipsis', icon: 'ellipsis' })
    centerLabel.innerHTML = sanitizeIcon(html)
  }
}

function updateCenterLabel() {
  const items = getCurrentItems()
  const idx = hoveredIndex !== null ? hoveredIndex : selectedIndex
  updateCenterContent(items[idx] || null)
}

let noActionTimeout = null
function showNoAction() {
  if (!centerLabel) return
  const centerEl = centerLabel.closest('.radial-center')
  centerEl?.classList.remove('radial-center--icon')
  centerLabel.textContent = 'No action'
  centerLabel.classList.add('no-action', 'wiggle')
  playSound('error')
  clearTimeout(noActionTimeout)
  noActionTimeout = setTimeout(() => {
    centerLabel.classList.remove('no-action', 'wiggle')
    updateCenterLabel()
  }, CONFIG.NO_ACTION_RESET_MS)
}

function handleItemClick(item, index) {
  if (item.isBack) {
    menuStack.pop()
    selectedIndex = 0
    positionItems()
    playSound('SubmenuOut')
    return
  }
  if (item.children && item.children.length > 0) {
    menuStack.push({ items: item.children })
    selectedIndex = 0
    positionItems()
    playSound('SubmenuIn')
    return
  }
  selectedIndex = index
  toggleMenu()
}

function updateSelection() {
  radialMenu.querySelectorAll('.radial-item').forEach((node, i) => {
    node.classList.toggle('selected', i === selectedIndex)
  })
  updateCenterLabel()
}

async function fetchMenu() {
  if (!window.electronAPI?.getMenu) return null
  try {
    return await window.electronAPI.getMenu()
  } catch (_) {
    return null
  }
}

async function openMenu() {
  let data = cachedMenu
  if (!data) {
    data = await fetchMenu()
    cachedMenu = data
  }
  if (!data || !data.root) {
    ROOT_ITEMS = []
    radialMenu.querySelectorAll('.radial-item').forEach((n) => n.remove())
    playSound('error')
    menuOpen = true
    menuStack = []
    radial.classList.remove('closing')
    radial.classList.add('open')
    radial.setAttribute('aria-hidden', 'false')
    if (centerLabel) {
      centerLabel.textContent = 'Cannot load menu'
      centerLabel.classList.add('no-action')
    }
    return
  }
  ROOT_ITEMS = data.root
  const ids = collectIds(ROOT_ITEMS)
  ids.add('back')
  await loadIcons(ids)
  playSound('Open')
  menuOpen = true
  menuStack = []
  radial.classList.remove('closing')
  radial.classList.add('open')
  radial.setAttribute('aria-hidden', 'false')
  if (centerLabel) centerLabel.classList.remove('no-action')
  selectedIndex = 0
  positionItems()
}

function closeMenu(chosenIndex, actionRan = true, isClose = false) {
  if (!menuOpen || isClosing) return
  isClosing = true
  if (isClose) playSound('Close')
  else playSound('Select')
  const items = getCurrentItems()
  const index = chosenIndex !== undefined ? chosenIndex : selectedIndex
  const chosen = getDisplayName(items[index])
  radial.classList.add('closing')
  function finishClose() {
    radial.removeEventListener('transitionend', onClose)
    clearTimeout(fallback)
    menuOpen = false
    menuStack = []
    isClosing = false
    radial.classList.remove('open', 'closing')
    radial.setAttribute('aria-hidden', 'true')
    if (el) { el.textContent = chosen || ''; el.classList.remove('no-action') }
  }
  function onClose(ev) {
    if (ev.target !== radialMenu) return
    finishClose()
  }
  const fallback = setTimeout(finishClose, CONFIG.CLOSE_FALLBACK_MS)
  radial.addEventListener('transitionend', onClose)
}

function toggleMenu() {
  if (menuOpen) {
    const chosenIndex = hoveredIndex !== null ? hoveredIndex : selectedIndex
    const items = getCurrentItems()
    const item = items[chosenIndex]
    if (item?.isBack || (item?.children && item.children.length > 0)) {
      handleItemClick(item, chosenIndex)
      return
    }
    const actionRan = item?.isClose ? true : runAction(item)
    if (!actionRan) {
      showNoAction()
      return
    }
    closeMenu(chosenIndex, actionRan, !!item?.isClose)
  } else {
    openMenu()
  }
}

function navigate(direction) {
  if (!menuOpen) return
  const items = getCurrentItems()
  playSound(direction > 0 ? 'Forward' : 'Backward')
  selectedIndex = (selectedIndex + direction + items.length) % items.length
  updateSelection()
}

async function init() {
  const data = await fetchMenu()
  if (!data || !data.root) {
    ROOT_ITEMS = []
    if (centerLabel) centerLabel.textContent = 'Cannot load menu'
    preloadSounds()
    return
  }
  cachedMenu = data
  ROOT_ITEMS = data.root
  const ids = collectIds(ROOT_ITEMS)
  ids.add('back')
  await loadIcons(ids)
  preloadSounds()
}

if (el) el.addEventListener('click', () => { if (!isClosing) toggleMenu() })

if (window.electronAPI?.onKey) {
  window.electronAPI.onKey(({ id, state }) => dispatchKey(id, state))
}

document.addEventListener('ktrl-key', (e) => {
  const { id, state } = e.detail
  if (id === 'KnC' && state === 'down') {
    if (isClosing) return
    toggleMenu()
  } else if (state === 'down') {
    if (id === 'KnL') navigate(-1)
    else if (id === 'KnR') navigate(1)
    else if (!menuOpen && el) el.textContent = id
  }
})
