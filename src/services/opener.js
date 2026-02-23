export function openExternal(urlOrPath) {
  if (window.electronAPI?.openExternal) {
    window.electronAPI.openExternal(urlOrPath)
  } else {
    console.log('Open:', urlOrPath)
  }
}
