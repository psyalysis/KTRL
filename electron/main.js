const { app, BrowserWindow, globalShortcut, ipcMain, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const yaml = require('js-yaml')

app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')

// Use AppData for cache - avoids "Access is denied" when running from restricted dirs (OneDrive, etc)
if (process.platform === 'win32' && process.env.APPDATA) {
  app.setPath('userData', path.join(process.env.APPDATA, 'Ktrl'))
}

// Prevent multiple instances - avoids cache lock conflicts ("Unable to move the cache")
if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}
app.on('second-instance', () => win?.show()?.focus())

let win = null

function createWindow() {
  win = new BrowserWindow({
    width: 840,
    height: 840,
    transparent: true,
    frame: false,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false
    }
  })

  win.loadFile('index.html')
  win.on('closed', () => { win = null })
}

function registerShortcuts() {
  const send = (id) => {
    if (win && !win.isDestroyed()) {
      win.show()
      win.focus()
      win.webContents.send('ktrl-key', id, 'down')
    }
  }

  const shortcuts = [
    ['F20', 'KnL'],
    ['F21', 'KnC'],
    ['F22', 'KnR'],
    ['Shift+Alt+Left', 'KnL'],
    ['Shift+Alt+Up', 'KnC'],
    ['Shift+Alt+Right', 'KnR']
  ]
  for (const [accel, id] of shortcuts) {
    if (!globalShortcut.register(accel, () => send(id))) {
      console.warn('Shortcut failed:', accel)
    }
  }
}

ipcMain.handle('get-icon', (_, id) => {
  const iconPath = path.join(__dirname, 'assets', 'icons', `${id}.svg`)
  if (!fs.existsSync(iconPath)) return null
  let svg = fs.readFileSync(iconPath, 'utf8')
  svg = svg.replace(/<\?xml[^?]*\?>\s*/i, '').trim()
  return svg
})

ipcMain.handle('open-external', (_, url) => shell.openExternal(url))

ipcMain.handle('get-menu', () => {
  const menuPath = path.join(__dirname, 'menu.yaml')
  const raw = fs.readFileSync(menuPath, 'utf8')
  return yaml.load(raw)
})

app.whenReady().then(() => {
  createWindow()
  registerShortcuts()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
      registerShortcuts()
    }
  })
})

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll()
  if (process.platform !== 'darwin') app.quit()
})
