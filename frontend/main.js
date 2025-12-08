const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

function waitForBackend(url, timeout = 2500) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const check = () => {
            http.get(url, (res) => {
                if (res.statusCode === 200) {
                    resolve(true);
                } else {
                    retry();
                }
            }).on('error', retry);
        };

        const retry = () => {
            if (Date.now() - start > timeout) {
                reject(new Error('Backend not ready'));
            } else {
                setTimeout(check, 300);
            }
        };

        check();
    });
}

function createWindow () {
    return new BrowserWindow({
        fullscreen: true,
        frame: false,
        backgroundColor: '#000000',
        webPreferences: {
            nodeIntegration: true
        }
    });
}

app.whenReady().then(async () => {
    const backendPath = path.join(__dirname, 'backend', 'backend.exe');
    const backend = spawn(backendPath, { stdio: 'pipe' });
    backend.unref();

    const win = createWindow();

    try {
        await waitForBackend('http://127.0.0.1:3000/login');
        win.loadURL('http://127.0.0.1:3000/login');

        win.webContents.on('did-navigate', (event, url) => {
            if (url.includes('/done')) {
                win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
            }
        });
    } catch (err) {
        console.error('Backend did not respond in time:', err);
        win.loadFile(path.join(__dirname, 'renderer', 'index.html')); // fallback
    }
});