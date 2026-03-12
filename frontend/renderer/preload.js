const { contextBridge, ipcRenderer } = require('electron');

const BACKEND_BASE_URL = 'http://127.0.0.1:3000';

contextBridge.exposeInMainWorld('vinylView', {
    backendBaseUrl: BACKEND_BASE_URL,
    openLogin() {
        window.open(`${BACKEND_BASE_URL}/login`, '_blank', 'width=500,height=700');
    },
    onScreensaverActivate(callback) {
        ipcRenderer.on('screensaver-activate', callback);
    },
    onScreensaverDeactivate(callback) {
        ipcRenderer.on('screensaver-deactivate', callback);
    },
    deactivateScreensaver() {
        ipcRenderer.send('deactivate-screensaver');
    },
    sendUserActivity() {
        ipcRenderer.send('user-activity');
    },
    getSettings() {
        return ipcRenderer.invoke('get-settings');
    },
    setSetting(key, value) {
        return ipcRenderer.invoke('set-setting', key, value);
    },
    // Dans le preload, expose :
    ecoMode: (callback) => ipcRenderer.on('eco-mode-changed', (_, enabled) => callback(enabled)),

});
