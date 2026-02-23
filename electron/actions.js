// Action registry: items with url/path are opened via openExternal; custom handlers override by action name.
function openExternal(urlOrPath) {
  if (window.electronAPI?.openExternal) {
    window.electronAPI.openExternal(urlOrPath)
  } else {
    console.log('Open:', urlOrPath)
  }
}

const ACTIONS = {
  // Custom handlers by action name (optional). Items with url/path are handled in runAction in app.js.
  // Add entries here only for actions that need custom logic without a url/path in menu.yaml.
}

function runAction(item) {
  if (!item) return false
  if (item.url) {
    openExternal(item.url)
    return true
  }
  if (item.path) {
    openExternal(item.path)
    return true
  }
  const fn = typeof ACTIONS !== 'undefined' && ACTIONS[item.action]
  if (typeof fn === 'function') {
    fn(item)
    return true
  }
  return false
}

function hasAction(item) {
  if (!item) return false
  if (item.isBack || item.isClose) return true
  if (item.children && item.children.length > 0) return true
  if (item.url || item.path) return true
  if (typeof ACTIONS !== 'undefined' && typeof ACTIONS[item.action] === 'function') return true
  return false
}

window.runActionFromRegistry = runAction
window.hasActionFromRegistry = hasAction
