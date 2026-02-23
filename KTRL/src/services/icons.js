export const FALLBACK_ICONS = {
  close: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>',
  ellipsis: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="6" cy="12" r="1.5" stroke="currentColor" stroke-width="2.5" fill="none"/><circle cx="12" cy="12" r="1.5" stroke="currentColor" stroke-width="2.5" fill="none"/><circle cx="18" cy="12" r="1.5" stroke="currentColor" stroke-width="2.5" fill="none"/></svg>',
  settings: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><line x1="4" y1="6" x2="20" y2="6" stroke-width="2.5"/><line x1="4" y1="12" x2="20" y2="12" stroke-width="2.5"/><line x1="4" y1="18" x2="20" y2="18" stroke-width="2.5"/><circle cx="8" cy="6" r="1.5" stroke="currentColor" stroke-width="2.5" fill="none"/><circle cx="16" cy="12" r="1.5" stroke="currentColor" stroke-width="2.5" fill="none"/><circle cx="12" cy="18" r="1.5" stroke="currentColor" stroke-width="2.5" fill="none"/></svg>',
  presets: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M4 6h16M4 12h16M4 18h7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><path d="M14 18l3-3-3-3" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  back: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M10.7071 7.70711C11.0976 7.31658 11.0976 6.68342 10.7071 6.29289C10.3166 5.90237 9.68342 5.90237 9.29289 6.29289L4.29289 11.2929C3.90237 11.6834 3.90237 12.3166 4.29289 12.7071L9.29289 17.7071C9.68342 18.0976 10.3166 18.0976 10.7071 17.7071C11.0976 17.3166 11.0976 16.6834 10.7071 16.2929L7.41422 13L19 13C19.5523 13 20 12.5523 20 12C20 11.4477 19.5523 11 19 11L7.41421 11L10.7071 7.70711Z" fill="currentColor"/></svg>'
}

const iconCache = {}

export function sanitizeIcon(svgString) {
  if (typeof svgString !== 'string') return ''
  return svgString
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '')
    .trim()
}

export function setIconSafe(container, svgString) {
  const safe = sanitizeIcon(svgString)
  let wrap = container.querySelector('.radial-item-icon')
  if (!wrap) {
    wrap = document.createElement('span')
    wrap.className = 'radial-item-icon'
    container.appendChild(wrap)
  }
  wrap.innerHTML = safe
}

export function collectIds(items) {
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

export async function loadIcons(ids, getIconFromBackend) {
  if (!getIconFromBackend) return
  const loads = [...ids].map(async (id) => {
    try {
      const svg = await getIconFromBackend(id)
      if (svg) iconCache[id] = svg
    } catch (_) {}
  })
  await Promise.allSettled(loads)
}

export function getIcon(item, cache = iconCache) {
  const id = item?.icon || item?.action
  return cache[id] || FALLBACK_ICONS[id] || FALLBACK_ICONS.ellipsis
}

export { iconCache }
