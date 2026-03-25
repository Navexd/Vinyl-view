<!-- ======================== -->
<!-- Settings.js
 Version final 25/03/2026 -->
<!-- ======================== -->

const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const SETTINGS_DEFAULTS = {
    screensaverAutoEnabled: true,
    idleTimeoutSeconds: 120,
    notifyBeforeScreensaver: true,
    ecoMode: false,
    launchAtStartup: false,
    startMinimized: true,
    screenChoice: 'primary'
};


let settings = { ...SETTINGS_DEFAULTS };

function getSettingsPath() {
    return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettings(log) {
    const filePath = getSettingsPath();
    try {
        if (fs.existsSync(filePath)) {
            const raw = fs.readFileSync(filePath, 'utf-8');
            const parsed = JSON.parse(raw);
            settings = { ...SETTINGS_DEFAULTS, ...parsed };
            log("✔ Settings chargés:", settings);
        } else {
            settings = { ...SETTINGS_DEFAULTS };
            saveSettings(log);
            log("✔ Settings créés avec valeurs par défaut");
        }
    } catch (e) {
        log("⚠ Erreur lecture settings, reset aux défauts:", e);
        settings = { ...SETTINGS_DEFAULTS };
        saveSettings(log);
    }
}

function saveSettings(log) {
    const filePath = getSettingsPath();
    try {
        fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf-8');
        log("💾 Settings sauvegardés");
    } catch (e) {
        log("⚠ Erreur sauvegarde settings:", e);
    }
}

function getSetting(key) {
    return key in settings ? settings[key] : SETTINGS_DEFAULTS[key];
}

function setSetting(key, value, log) {
    settings[key] = value;
    saveSettings(log);
}

function getAllSettings() {
    return { ...settings };
}

module.exports = {
    loadSettings,
    saveSettings,
    getSetting,
    setSetting,
    getAllSettings,
    SETTINGS_DEFAULTS
};
