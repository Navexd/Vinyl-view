const { app, BrowserWindow } = require('electron')

function createWindow () {
    const win = new BrowserWindow({
        fullscreen: true,
        frame: false,
        backgroundColor: '#000000',
        webPreferences: {
            nodeIntegration: true
        }
      });

      win.loadFile('renderer/index.html')
}
app.whenReady().then(createWindow)

