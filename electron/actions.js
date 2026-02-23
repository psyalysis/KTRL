// Actions keyed by menu item action. Add a function for each action to enable it.
// Example: browser, files, notes, up, right, down, up-circle, right-circle, settings
const ACTIONS = {
  browser: () => {
    if (window.electronAPI?.openExternal) {
      window.electronAPI.openExternal('https://google.com')
    } else {
      console.log('Browser: open https://google.com')
    }
  },
  files: () => {
    if (window.electronAPI?.openExternal) {
      window.electronAPI.openExternal('C:\Users\DREAD\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\File Explorer.lnk')
    } else {
      console.log('Files: open file explorer located at C:\Users\DREAD\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\File Explorer.lnk')
    }
  },
  notes: () => {
    if (window.electronAPI?.openExternal) {
      window.electronAPI.openExternal('C:\Windows\System32\notepad.exe')
    } else {
      console.log('Notes: open notepad located at C:\Windows\System32\notepad.exe')
    }
  }
}