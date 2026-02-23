import { CONFIG } from '../config.js'
import { setIconSafe, sanitizeIcon, getIcon } from '../services/icons.js'

const RADIUS = CONFIG.RADIUS
const CENTER = CONFIG.CENTER
const MAX_VISIBLE_ITEMS = CONFIG.MAX_VISIBLE_ITEMS
const useIcons = true
const CAROUSEL_ROW_HEIGHT = CONFIG.CAROUSEL_ROW_HEIGHT ?? 36
const VALUE_ANIMATION_DURATION_MS = CONFIG.VALUE_ANIMATION_DURATION_MS ?? 280

let listeners = { select: [], navigate: [], hover: [] }
let prevDropdownIdx = null
let prevDropdownFocusedId = null
const valueDisplayMap = new Map()
let valueRafId = null

export function mount(containerElement, centerLabelElement) {
  // Mount is implicit: we're given refs and use them in render
  return { containerElement, centerLabelElement }
}

export function on(event, handler) {
  if (listeners[event]) listeners[event].push(handler)
}

function emit(event, data) {
  (listeners[event] || []).forEach((h) => h(data))
}

function getDisplayName(item) {
  return item?.name ?? item?.label ?? ''
}

function hasAction(item) {
  if (!item) return false
  if (item.isBack || item.isClose) return true
  if (item.childNodeId) return true
  if (item.url || item.path) return true
  if (item.type === 'value' || item.type === 'toggle' || item.type === 'dropdown') return true
  if (item.id === 'add-file-shortcut' || item.id === 'add-url-shortcut') return true
  return false
}

export function render(state, options = {}) {
  const { containerElement, centerLabelElement } = options
  if (!containerElement || !centerLabelElement) return

  const radialMenu = containerElement.querySelector('.radial-menu') || containerElement
  const centerLabel = centerLabelElement.tagName ? centerLabelElement : centerLabelElement.querySelector?.('.radial-center-label') || centerLabelElement

  let items = state.items || []
  if (items.length > MAX_VISIBLE_ITEMS) items = items.slice(0, MAX_VISIBLE_ITEMS)
  const count = items.length
  const step = (2 * Math.PI) / count
  const angles = Array.from({ length: count }, (_, i) => -Math.PI / 2 + step * i)
  const existing = radialMenu.querySelectorAll('.radial-item')
  const getIconFn = options.getIcon || (() => '')
  const wiggleRemoval = Boolean(options.shortcutRemovalMode && state.nodeId === 'shortcuts')

  items.forEach((item, i) => {
    let node = existing[i]
    if (!node) {
      node = document.createElement('div')
      node.className = 'radial-item radial-item--icon'
      radialMenu.appendChild(node)
    }

    const angle = angles[i]
    const x = CENTER + RADIUS * Math.cos(angle)
    const y = CENTER + RADIUS * Math.sin(angle)
    node.style.left = x + 'px'
    node.style.top = y + 'px'
    node.dataset.index = String(i)
    node.dataset.itemId = item.id || ''
    node.setAttribute('aria-label', getDisplayName(item))
    node.classList.toggle('selected', i === (state.hoveredIndex != null ? state.hoveredIndex : state.selectedIndex))
    node.classList.toggle('no-action-item', !hasAction(item))
    node.classList.toggle('wiggle-removal', wiggleRemoval && Boolean(item.url || item.path))

    if (item.type === 'toggle') {
      node.classList.add('radial-item--toggle')
      const on = state.widgetState?.[item.id]
      node.classList.toggle('radial-item--toggle-on', on)
      node.classList.toggle('radial-item--toggle-off', !on)
      const useIcon = useIcons && (item.icon || item.action)
      if (useIcon) {
        node.innerHTML = ''
        setIconSafe(node, getIconFn(item) || getIcon(item, options.iconCache))
      } else {
        let wrap = node.querySelector('.radial-item-widget')
        if (!wrap) {
          node.innerHTML = ''
          wrap = document.createElement('div')
          wrap.className = 'radial-item-widget'
          const nameLine = document.createElement('span')
          nameLine.className = 'radial-item-widget-name'
          nameLine.textContent = getDisplayName(item)
          wrap.appendChild(nameLine)
          node.appendChild(wrap)
        } else {
          const nameEl = wrap.querySelector('.radial-item-widget-name')
          if (nameEl) nameEl.textContent = getDisplayName(item)
        }
      }
    } else if (item.type === 'value') {
      node.classList.add('radial-item--value')
      const target = state.widgetState?.[item.id] ?? 0
      const centerLabelEl = centerLabel?.closest?.('.radial-center')?.querySelector('.radial-center-label') || centerLabel
      const isValueFocused = state.focusMode === 'value' && state.focusedItemId === item.id
      let displayState = valueDisplayMap.get(item.id)
      if (!displayState || displayState.node !== node) displayState = { current: target, node }
      valueDisplayMap.set(item.id, displayState)
      displayState.centerLabelEl = isValueFocused ? centerLabelEl : null
      const current = displayState.current
      if (current !== target) {
        if (valueRafId) cancelAnimationFrame(valueRafId)
        const startTime = performance.now()
        const duration = VALUE_ANIMATION_DURATION_MS / 1000
        const startVal = current
        const tick = () => {
          const t = Math.min((performance.now() - startTime) / duration, 1)
          const eased = 1 - (1 - t) * (1 - t)
          displayState.current = startVal + (target - startVal) * eased
          if (displayState.centerLabelEl) displayState.centerLabelEl.textContent = `${Math.round(displayState.current)}%`
          if (t < 1) valueRafId = requestAnimationFrame(tick)
          else {
            displayState.current = target
            if (displayState.centerLabelEl) displayState.centerLabelEl.textContent = `${Math.round(target)}%`
            valueRafId = null
          }
        }
        valueRafId = requestAnimationFrame(tick)
      } else {
        if (displayState.centerLabelEl) displayState.centerLabelEl.textContent = `${Math.round(target)}%`
      }
      const useIcon = useIcons && (item.icon || item.action)
      if (useIcon) {
        node.innerHTML = ''
        setIconSafe(node, getIconFn(item) || getIcon(item, options.iconCache))
      } else {
        let wrap = node.querySelector('.radial-item-widget')
        if (!wrap) {
          node.innerHTML = ''
          wrap = document.createElement('div')
          wrap.className = 'radial-item-widget'
          const nameLine = document.createElement('span')
          nameLine.className = 'radial-item-widget-name'
          nameLine.textContent = getDisplayName(item)
          wrap.appendChild(nameLine)
          node.appendChild(wrap)
        } else {
          const nameEl = wrap.querySelector('.radial-item-widget-name')
          if (nameEl) nameEl.textContent = getDisplayName(item)
        }
      }
    } else if (item.type === 'dropdown') {
      node.classList.add('radial-item--dropdown')
      const useIcon = useIcons && (item.icon || item.action)
      if (useIcon) {
        node.innerHTML = ''
        setIconSafe(node, getIconFn(item) || getIcon(item, options.iconCache))
      } else {
        let wrap = node.querySelector('.radial-item-widget')
        if (!wrap) {
          node.innerHTML = ''
          wrap = document.createElement('div')
          wrap.className = 'radial-item-widget'
          const nameLine = document.createElement('span')
          nameLine.className = 'radial-item-widget-name'
          nameLine.textContent = getDisplayName(item)
          wrap.appendChild(nameLine)
          node.appendChild(wrap)
        } else {
          const nameEl = wrap.querySelector('.radial-item-widget-name')
          if (nameEl) nameEl.textContent = getDisplayName(item)
        }
      }
    } else {
      node.classList.remove('radial-item--toggle', 'radial-item--value', 'radial-item--dropdown', 'radial-item--toggle-on', 'radial-item--toggle-off')
      node.innerHTML = ''
      if (useIcons) {
        setIconSafe(node, getIcon(item, options.iconCache))
      } else {
        const textEl = document.createElement('span')
        textEl.className = 'radial-item-text'
        textEl.textContent = getDisplayName(item)
        node.appendChild(textEl)
      }
    }
  })

  while (radialMenu.querySelectorAll('.radial-item').length > count) {
    const list = radialMenu.querySelectorAll('.radial-item')
    list[list.length - 1].remove()
  }

  const centerEl = centerLabel.closest?.('.radial-center')
  if (state.focusMode === 'dropdown' && state.focusedItemId) {
    const dropdownItem = state.items?.find((i) => i.id === state.focusedItemId)
    const opts = dropdownItem?.options ?? []
    const idx = state.dropdownOptionIndex ?? 0
    const n = opts.length
    const prevIdx = n ? (idx - 1 + n) % n : 0
    const nextIdx = n ? (idx + 1) % n : 0
    const order = n >= 3 ? [prevIdx, idx, nextIdx] : n === 2 ? (idx === 0 ? [1, 0, 1] : [0, 1, 0]) : [idx, idx, idx]
    centerEl?.classList.remove('radial-center--icon')
    let wrap = centerLabel.querySelector('.radial-center-dropdown')
    const lines = wrap?.querySelectorAll('.radial-center-dropdown-line')
    const sameDropdown = prevDropdownFocusedId === state.focusedItemId
    if (wrap && lines?.length === 3) {
      order.forEach((optIndex, i) => {
        const line = lines[i]
        if (line) {
          line.textContent = opts[order[i]] ?? ''
          line.classList.toggle('selected', order[i] === idx)
        }
      })
      if (sameDropdown && n >= 2 && prevDropdownIdx !== null && prevDropdownIdx !== idx) {
        let direction = idx - prevDropdownIdx
        if (n > 0 && direction > n / 2) direction -= n
        if (n > 0 && direction < -n / 2) direction += n
        wrap.style.transition = 'transform 0.28s cubic-bezier(0.25, 0.1, 0.25, 1)'
        wrap.style.transform = `translateY(${direction * CAROUSEL_ROW_HEIGHT}px)`
        wrap.offsetHeight
        requestAnimationFrame(() => {
          wrap.style.transform = 'translateY(0)'
        })
        const onEnd = () => {
          wrap.removeEventListener('transitionend', onEnd)
          wrap.style.transition = ''
          wrap.style.transform = ''
          prevDropdownIdx = idx
        }
        wrap.addEventListener('transitionend', onEnd)
      } else {
        prevDropdownIdx = idx
        prevDropdownFocusedId = state.focusedItemId
      }
    } else {
      centerLabel.innerHTML = ''
      wrap = document.createElement('div')
      wrap.className = 'radial-center-dropdown'
      order.forEach((optIndex) => {
        const line = document.createElement('div')
        line.className = 'radial-center-dropdown-line' + (optIndex === idx ? ' selected' : '')
        line.textContent = opts[optIndex] ?? ''
        wrap.appendChild(line)
      })
      centerLabel.appendChild(wrap)
      prevDropdownIdx = idx
      prevDropdownFocusedId = state.focusedItemId
    }
  } else {
    prevDropdownIdx = null
    prevDropdownFocusedId = null
    centerEl?.classList.remove('radial-center--icon')
    if (centerLabel.querySelector?.('.radial-center-dropdown')) {
      centerLabel.querySelector('.radial-center-dropdown')?.remove()
    }
    if (state.focusMode !== 'value') {
      centerLabel.textContent = state.centerLabel ?? 'Menu'
    } else {
      const focusedItem = state.items?.find((i) => i.id === state.focusedItemId)
      if (focusedItem?.type === 'toggle') centerLabel.textContent = state.centerLabel ?? 'Menu'
    }
  }
}

export function attachListeners(containerElement, getState) {
  const radialMenu = containerElement.querySelector('.radial-menu') || containerElement
  radialMenu.addEventListener(
    'mouseenter',
    (e) => {
      const itemEl = e.target.closest('.radial-item')
      if (!itemEl) return
      const i = parseInt(itemEl.dataset.index, 10)
      if (!Number.isNaN(i)) emit('hover', { index: i })
    },
    true
  )
  radialMenu.addEventListener(
    'mouseleave',
    (e) => {
      if (!e.relatedTarget?.closest('.radial-item')) emit('hover', { index: null })
    },
    true
  )
  radialMenu.addEventListener(
    'click',
    (e) => {
      const itemEl = e.target.closest('.radial-item')
      if (!itemEl) return
      const i = parseInt(itemEl.dataset.index, 10)
      if (!Number.isNaN(i)) emit('select', { index: i })
    },
    true
  )
}
