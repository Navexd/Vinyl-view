// utils.js Version final 25/03/2026
const path = require('path');
const { isDev } = require('./logger');

const BACKEND_BASE_URL = 'http://127.0.0.1:3000';
const SCREENSAVER_EXIT_GRACE_MS = 1000;

const ROOT = path.join(__dirname, '..');

let screensaverActivatedAt = 0;

function getBackendPath() {
    const folder = process.platform === "win32" ? "backend-win" : "backend-linux";
    const exeName = process.platform === "win32" ? "backend.exe" : "backend";
    return isDev
        ? path.join(ROOT, folder, exeName)
        : path.join(process.resourcesPath, folder, exeName);
}

function getRendererPath() {
    return isDev
        ? path.join(ROOT, "renderer", "index.html")
        : path.join(process.resourcesPath, "renderer", "index.html");
}

function getPreloadPath() {
    return isDev
        ? path.join(ROOT, "renderer", "preload.js")
        : path.join(process.resourcesPath, "renderer", "preload.js");
}

function getSetupPath() {
    return isDev
        ? path.join(ROOT, "renderer", "setup.html")
        : path.join(process.resourcesPath, "renderer", "setup.html");
}

function getSetupPreloadPath() {
    return isDev
        ? path.join(ROOT, "renderer", "preload-setup.js")
        : path.join(process.resourcesPath, "renderer", "preload-setup.js");
}

function getIconPath() {
    const ext = process.platform === 'win32' ? 'ico' : 'png';
    const iconName = `album.${ext}`;
    return isDev
        ? path.join(ROOT, "assets", iconName)
        : path.join(process.resourcesPath, "assets", iconName);
}

function getTrayIconPath() {
    return isDev
        ? path.join(ROOT, "assets", "4.png")
        : path.join(process.resourcesPath, "assets", "4.png");
}

function isAllowedUrl(targetUrl) {
    try {
        const url = new URL(targetUrl);
        return (
            url.origin === 'https://accounts.spotify.com' ||
            targetUrl.startsWith(`${BACKEND_BASE_URL}/login`) ||
            targetUrl.startsWith(`${BACKEND_BASE_URL}/callback`) ||
            targetUrl.startsWith(`${BACKEND_BASE_URL}/status`) ||
            targetUrl.startsWith(`${BACKEND_BASE_URL}/done`)
        );
    } catch {
        return false;
    }
}

function canExitScreensaverNow() {
    return Date.now() - screensaverActivatedAt >= SCREENSAVER_EXIT_GRACE_MS;
}

function setScreensaverActivatedAt(ts) {
    screensaverActivatedAt = ts;
}

function getScreensaverActivatedAt() {
    return screensaverActivatedAt;
}

module.exports = {
    BACKEND_BASE_URL,
    SCREENSAVER_EXIT_GRACE_MS,
    getBackendPath,
    getRendererPath,
    getPreloadPath,
    getSetupPath,
    getSetupPreloadPath,
    getIconPath,
    getTrayIconPath,
    isAllowedUrl,
    canExitScreensaverNow,
    setScreensaverActivatedAt,
    getScreensaverActivatedAt
};
