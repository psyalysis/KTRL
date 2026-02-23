/**
 * Build a flat map of menu nodes from menu.yaml root.
 * Items: id, name, icon, url, path, isClose, type, options, default; childNodeId if submenu.
 * Supports shorthand: "open" (URL or path) is normalized to url or path.
 */
function isUrl(s) {
  const t = String(s).trim()
  return /^(https?|mailto|tel):/i.test(t)
}

export function buildMenuNodes(menuRoot) {
  const nodes = new Map()
  const rootList = menuRoot?.root ?? []
  let nodeIdCounter = 0
  function nextId() {
    return `_n${++nodeIdCounter}`
  }

  function normalizeItem(item, parentNodeId) {
    const id = item.id ?? item.action ?? nextId()
    const name = item.name ?? item.label ?? ''
    let url = item.url
    let path = item.path
    if (item.open != null && item.open !== '') {
      if (isUrl(item.open)) url = String(item.open).trim()
      else path = String(item.open).trim()
    }
    const openVal = item.open != null && item.open !== '' ? String(item.open).trim() : (url || path)
    const normalized = {
      id,
      name,
      action: item.action ?? id,
      icon: item.icon,
      url,
      path,
      open: openVal || undefined,
      isClose: item.isClose ?? item.is_close ?? false,
      type: item.type ?? item.widget ?? item.item_type,
      options: item.options,
      default: item.default
    }
    if (item.children?.length) {
      const childNodeId = item.action ?? id
      normalized.childNodeId = childNodeId
      buildNode(childNodeId, item.children, parentNodeId)
    }
    return normalized
  }

  function buildNode(nodeId, items, parentId) {
    const nodeItems = items.map((item) => normalizeItem(item, nodeId))
    nodes.set(nodeId, {
      id: nodeId,
      label: 'Menu',
      items: nodeItems,
      parentId
    })
  }

  const rootId = 'root'
  const rootItems = rootList.map((item) => normalizeItem(item, rootId))
  nodes.set(rootId, {
    id: rootId,
    label: 'Menu',
    items: rootItems,
    parentId: null
  })

  return { nodes, rootId }
}

/**
 * Collect all icon/action ids from a node map (for preloading).
 */
export function collectIdsFromNodes(nodes) {
  const ids = new Set(['back'])
  for (const node of nodes.values()) {
    for (const item of node.items) {
      if (item.action) ids.add(item.action)
      if (item.icon) ids.add(item.icon)
    }
  }
  return ids
}
