const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');

let backend; // référence globale au process backend

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

// ✅ Redirection des logs vers log/electron.log avec timestamp
const logDir = path.join(process.cwd(), 'log');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}
const logPath = path.join(logDir, 'electron.log');

function logToFile(msg) {
    const timestamp = new Date().toISOString().replace('T', ' ').split('.')[0];
    fs.appendFileSync(logPath, `[${timestamp}] ${msg}\n`);
}
console.log = logToFile;
console.error = logToFile;

app.whenReady().then(async () => {
    const backendPath = path.join(__dirname, 'backend', 'backend.exe');
    backend = spawn(backendPath, { stdio: 'pipe' });

    backend.stdout.on('data', (data) => {
        console.log(`Backend: ${data}`);
    });

    backend.stderr.on('data', (data) => {
        console.error(`Backend error: ${data}`);
    });

    const win = createWindow();

    try {
        await waitForBackend('http://127.0.0.1:3000/login');
        console.log("🚀 App Electron lancée, backend prêt");
        win.loadURL('http://127.0.0.1:3000/login');

        win.webContents.on('did-navigate', (event, url) => {
            if (url.includes('/done')) {
                console.log("✅ Navigation vers /done → chargement économiseur");
                win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
            }
        });
    } catch (err) {
        console.error('Backend did not respond in time:', err);
        win.loadFile(path.join(__dirname, 'renderer', 'index.html')); // fallback
    }
});

// ✅ tuer le backend quand l’app Electron se ferme
app.on('quit', () => {
    if (backend) {
        backend.kill();
        console.log("Backend process killed.");
    }
});