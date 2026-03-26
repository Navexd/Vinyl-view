// logger.js version final 25/03/2026
const { app, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// --- Compat electron-is-dev robuste ---
const isDev = !app.isPackaged;


const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const LOG_LEVEL = isDev ? 'debug' : 'info';

const logDir = path.join(app.getPath("userData"), "log");
if (!fs.existsSync(logDir)) {
    try { fs.mkdirSync(logDir, { recursive: true }); } catch {}
}

const logFile = path.join(logDir, "electron.log");

// Rotation simple au démarrage (> 2 Mo → .old)
try {
    if (fs.existsSync(logFile) && fs.statSync(logFile).size > 2 * 1024 * 1024) {
        const old = logFile + '.old';
        if (fs.existsSync(old)) fs.unlinkSync(old);
        fs.renameSync(logFile, old);
    }
} catch {}

function log(category, level, ...args) {
    if (LOG_LEVELS[level] == null) { args.unshift(level); level = 'info'; }
    if (LOG_LEVELS[level] < LOG_LEVELS[LOG_LEVEL]) return;

    const ts = new Date().toLocaleString('sv-SE', { hour12: false }).replace('T', ' ');
    const tag = `[${ts}] [${category}] [${level.toUpperCase()}]`;
    const msg = args.map(a => {
        try { return typeof a === 'string' ? a : JSON.stringify(a); }
        catch { return String(a); }
    }).join(' ');

    const line = `${tag} ${msg}`;
    console.log(line);
    try { fs.appendFileSync(logFile, line + '\n'); } catch {}
}

// Raccourcis par catégorie
const logMain        = (...a) => log('main',        ...a);
const logBackend     = (...a) => log('backend',     ...a);
const logScreensaver = (...a) => log('screensaver', ...a);
const logIdle        = (...a) => log('idle',        ...a);
const logRenderer    = (...a) => log('renderer',    ...a);
const logTray        = (...a) => log('tray',        ...a);
const logSettings    = (...a) => log('settings',    ...a);
const logSecurity    = (...a) => log('security',    ...a);
const logWindow      = (...a) => log('window',      ...a);

// IPC log depuis le renderer
ipcMain.on('renderer-log', (_, category, level, msg) => {
    log(category || 'renderer', level || 'info', msg);
});

module.exports = {
    log,
    logMain,
    logBackend,
    logScreensaver,
    logIdle,
    logRenderer,
    logTray,
    logSettings,
    logSecurity,
    logWindow,
    isDev
};
