const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow () {
    const win = new BrowserWindow({
        fullscreen: true,          // mode économiseur d’écran
        frame: false,              // pas de barre de fenêtre
        backgroundColor: '#000000',
        webPreferences: {
            nodeIntegration: true
        }
    });

    // Charge ton fichier index.html dans frontend/renderer
    win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(createWindow);

