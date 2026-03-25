// ipc.js Version final 25/03/2026
const { app, ipcMain } = require('electron');
const { log, logSettings, isDev } = require('./logger');
const { getSetting, setSetting, getAllSettings } = require('../settings');
const { BACKEND_BASE_URL } = require('./utils');
const screensaver = require('./screensaver');

// -------- IPC SETTINGS --------

ipcMain.handle('get-settings', () => {
    return getAllSettings();
});

ipcMain.handle('set-setting', (event, key, value) => {
    setSetting(key, value, log);
    logSettings('info', `${key} = ${JSON.stringify(value)}`);

    if (key === 'screensaverAutoEnabled') {
        if (value) {
            screensaver.startIdleWatcher();
        } else {
            screensaver.stopIdleWatcher();
            if (screensaver.getIsScreensaverActive()) {
                screensaver.deactivateScreensaver();
            }
        }
    }

    if (key === 'launchAtStartup') {
        app.setLoginItemSettings({
            openAtLogin: value,
            path: app.getPath('exe')
        });
        logSettings('info', `Lancement au démarrage: ${value ? 'ON' : 'OFF'}`);
    }

    return getAllSettings();
});

// -------- SYSTEM INFO --------

async function getAboutInfo() {
    const os = require('os');
    const { screen } = require('electron');

    let backendStatus = 'inconnu';
    try {
        const res = await fetch(`${BACKEND_BASE_URL}/status`, { signal: AbortSignal.timeout(3000) });
        backendStatus = res.ok ? 'connecté' : 'erreur';
    } catch {
        backendStatus = 'déconnecté';
    }

    return {
        appVersion: app.getVersion(),
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        node: process.versions.node,
        os: `${os.type()} ${os.release()}`,
        platform: process.platform,
        arch: process.arch,
        cpu: os.cpus()[0]?.model || 'inconnu',
        cores: os.cpus().length,
        ram: `${Math.round(os.totalmem() / 1024 / 1024 / 1024)} Go`,
        ramFree: `${Math.round(os.freemem() / 1024 / 1024 / 1024)} Go`,
        screens: screen.getAllDisplays().length,
        uptime: `${Math.round(os.uptime() / 3600)}h`,
        backend: backendStatus,
        ecoMode: getSetting('ecoMode') || false,
        autoMode: getSetting('screensaverAutoEnabled') || true,
        isDev
    };
}

module.exports = {
    getAboutInfo
};
