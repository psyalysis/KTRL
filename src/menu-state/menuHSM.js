import { CONFIG } from '../config.js'

const VALUE_STEP = CONFIG.VALUE_STEP ?? 5

/**
 * Create menu HSM. state: { nodes, rootId, nodeId, selectedIndex, isOpen, focusMode, focusedItemId, widgetState, dropdownOptionIndex }.
 * focusMode: null | 'value' | 'dropdown'
 * widgetState: { [itemId]: number } for value (0-100) and dropdown (index), { [itemId]: boolean } for toggle.
 * initialWidgetState: optional { [itemId]: value } to seed widget state (e.g. from Settings).
 */
export function createMenuHSM(nodes, rootId, initialWidgetState = {}) {
  let state = {
    nodes,
    rootId,
    nodeId: rootId,
    selectedIndex: 0,
    isOpen: false,
    focusMode: null,
    focusedItemId: null,
    widgetState: {},
    dropdownOptionIndex: 0
  }

  function getNode(id) {
    return state.nodes.get(id)
  }

  function getCurrentItems() {
    const node = getNode(state.nodeId)
    if (!node) return []
    const items = [...node.items]
    if (node.parentId != null) {
      items.push({ id: 'back', name: 'Back', icon: 'back', isBack: true })
    }
    return items
  }

  function ensureWidgetDefaults() {
    const node = getNode(state.nodeId)
    if (!node) return
    for (const item of node.items) {
      if (item.id && state.widgetState[item.id] === undefined) {
        if (item.type === 'value') {
          state.widgetState[item.id] = Math.min(100, Math.max(0, Number(item.default) || 0))
        } else if (item.type === 'toggle') {
          state.widgetState[item.id] = Boolean(item.default)
        } else if (item.type === 'dropdown' && item.options?.length) {
          state.widgetState[item.id] = Math.min(item.options.length - 1, Math.max(0, Number(item.default) || 0))
        }
      }
    }
  }

  function getItemAt(index) {
    const items = getCurrentItems()
    return items[index] ?? null
  }

  function dispatch(event, payload = {}) {
    const sideEffects = {}
    const items = getCurrentItems()
    const item = payload.item ?? getItemAt(state.selectedIndex)

    switch (event) {
      case 'OPEN': {
        state.nodeId = state.rootId
        state.selectedIndex = 0
        state.isOpen = true
        state.focusMode = null
        state.focusedItemId = null
        ensureWidgetDefaults()
        for (const [id, value] of Object.entries(initialWidgetState)) {
          if (id) state.widgetState[id] = value
        }
        sideEffects.sound = 'Open'
        break
      }

      case 'CLOSE': {
        if (state.focusMode) {
          state.focusMode = null
          state.focusedItemId = null
          sideEffects.sound = 'Select'
        } else {
          state.isOpen = false
          sideEffects.sound = payload.sound ?? 'Close'
          sideEffects.close = true
        }
        break
      }

      case 'ENTER_SUBMENU': {
        if (!item?.childNodeId) break
        state.nodeId = item.childNodeId
        state.selectedIndex = 0
        ensureWidgetDefaults()
        sideEffects.sound = 'SubmenuIn'
        break
      }

      case 'BACK': {
        if (state.focusMode === 'value' || state.focusMode === 'dropdown') {
          state.focusMode = null
          state.focusedItemId = null
          sideEffects.sound = 'Select'
        } else {
          const node = getNode(state.nodeId)
          if (node?.parentId) {
            state.nodeId = node.parentId
            state.selectedIndex = 0
            sideEffects.sound = 'SubmenuOut'
          }
        }
        break
      }

      case 'SELECT': {
        if (item?.isBack) {
          return dispatch('BACK')
        }
        if (item?.childNodeId) {
          return dispatch('ENTER_SUBMENU', { item })
        }
        if (item?.type === 'value') {
          state.focusMode = 'value'
          state.focusedItemId = item.id
          if (state.widgetState[item.id] === undefined) state.widgetState[item.id] = Math.min(100, Math.max(0, Number(item.default) || 0))
          sideEffects.sound = 'Select'
          break
        }
        if (item?.type === 'toggle') {
          state.focusMode = 'value'
          state.focusedItemId = item.id
          if (state.widgetState[item.id] === undefined) state.widgetState[item.id] = Boolean(item.default)
          sideEffects.sound = 'Select'
          break
        }
        if (item?.type === 'dropdown' && item.options?.length) {
          state.focusMode = 'dropdown'
          state.focusedItemId = item.id
          state.dropdownOptionIndex = state.widgetState[item.id] ?? 0
          if (state.widgetState[item.id] === undefined) state.widgetState[item.id] = 0
          sideEffects.sound = 'Select'
          break
        }
        if (item?.url || item?.path) {
          sideEffects.open = item.url || item.path
          sideEffects.close = true
          sideEffects.sound = item.isClose ? 'Close' : 'Select'
          break
        }
        if (item?.isClose) {
          sideEffects.close = true
          sideEffects.sound = 'Close'
          break
        }
        sideEffects.noAction = true
        sideEffects.sound = 'Error'
        break
      }

      case 'UNFOCUS_VALUE': {
        state.focusMode = null
        state.focusedItemId = null
        sideEffects.sound = 'Select'
        break
      }

      case 'UNFOCUS_DROPDOWN': {
        if (state.focusedItemId != null) {
          state.widgetState[state.focusedItemId] = state.dropdownOptionIndex
        }
        state.focusMode = null
        state.focusedItemId = null
        sideEffects.sound = 'Select'
        break
      }

      case 'ADJUST_VALUE': {
        if (state.focusMode !== 'value' || !state.focusedItemId) break
        const node = getNode(state.nodeId)
        const focusedItem = node?.items?.find((i) => i.id === state.focusedItemId)
        const delta = payload.delta ?? 0
        if (focusedItem?.type === 'toggle') {
          state.widgetState[state.focusedItemId] = delta > 0
          sideEffects.sound = state.widgetState[state.focusedItemId] ? 'IncreaseEnable' : 'DecreaseDisable'
        } else {
          const current = state.widgetState[state.focusedItemId] ?? 0
          const v = Math.min(100, Math.max(0, current + delta * VALUE_STEP))
          state.widgetState[state.focusedItemId] = v
          if (v === current && ((delta > 0 && current >= 100) || (delta < 0 && current <= 0))) {
            sideEffects.valueClamped = true
            sideEffects.sound = 'Error'
          } else if (v !== current) {
            sideEffects.valueBump = delta
            sideEffects.sound = delta > 0 ? 'IncreaseEnable' : 'DecreaseDisable'
          }
        }
        break
      }

      case 'DROPDOWN_NAVIGATE': {
        if (state.focusMode !== 'dropdown' || !state.focusedItemId) break
        const node = getNode(state.nodeId)
        const dropdownItem = node?.items?.find((i) => i.id === state.focusedItemId)
        const len = dropdownItem?.options?.length ?? 0
        if (len === 0) break
        const delta = payload.delta ?? 0
        state.dropdownOptionIndex = (state.dropdownOptionIndex + delta + len) % len
        sideEffects.sound = delta > 0 ? 'IncreaseEnable' : 'DecreaseDisable'
        break
      }

      case 'NAVIGATE': {
        if (state.focusMode) break
        const delta = payload.delta ?? 0
        state.selectedIndex = (state.selectedIndex + delta + items.length) % items.length
        sideEffects.sound = delta > 0 ? 'Forward' : 'Backward'
        break
      }

      default:
        break
    }

    return { state: { ...state }, sideEffects }
  }

  function getState() {
    const items = getCurrentItems()
    const node = getNode(state.nodeId)
    let centerLabel = 'Menu'
    if (state.focusMode === 'value' && state.focusedItemId != null) {
      const focusedItem = node?.items?.find((i) => i.id === state.focusedItemId)
      if (focusedItem?.type === 'toggle') {
        centerLabel = state.widgetState[state.focusedItemId] ? 'On' : 'Off'
      } else {
        const v = state.widgetState[state.focusedItemId] ?? 0
        centerLabel = `${Math.round(v)}%`
      }
    } else if (state.focusMode === 'dropdown' && state.focusedItemId != null) {
      const dropdownItem = node?.items?.find((i) => i.id === state.focusedItemId)
      const opts = dropdownItem?.options ?? []
      centerLabel = opts[state.dropdownOptionIndex] ?? ''
    } else {
      const idx = state.selectedIndex
      const it = items[idx]
      centerLabel = it?.name ?? it?.label ?? 'Menu'
    }

    return {
      ...state,
      items,
      centerLabel,
      node: getNode(state.nodeId)
    }
  }

  return { getState, dispatch }
}
