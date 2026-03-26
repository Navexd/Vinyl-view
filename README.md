<div align="center">

# 🎵 Vinyl View

**A Spotify now-playing visualizer with an animated vinyl turntable**

![Version](https://img.shields.io/badge/version-4.3.1-brown?style=flat-square)
![Electron](https://img.shields.io/badge/Electron-39-47848F?style=flat-square&logo=electron)
![Rust](https://img.shields.io/badge/Rust-1.93-CE422B?style=flat-square&logo=rust)
![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-lightgrey?style=flat-square)

*Watch your music come to life — track info, album art, and a spinning vinyl turntable that reacts to what you're listening to.*

</div>

---

## ✨ Features

- **Animated vinyl turntable** — realistic rotation with grooves, tonearm and label artwork
- **Dynamic background** — colors extracted from the album cover, three visual effects (Float, Wave, Pulse)
- **Speed adapts to context** — playlist (33 RPM), album (38 RPM), single (45 RPM)
- **Screensaver mode** — full-screen display with `AlwaysOnTop`, auto-activates on idle
- **Eco mode** — throttles to 30 FPS, dims UI, reduces API polling
- **System tray** — runs in the background, double-click to restore
- **Theme switching** — press `1`, `2`, `3` to change the background effect at any time, even in screensaver mode
- **Cross-platform** — Windows (NSIS installer) and Linux (AppImage)

---

## 📸 Screenshots

> *Coming soon*

---

## 🚀 Getting Started

### Download

Head to the [Releases](../../releases) page and download the latest version for your platform:

| Platform | File |
|----------|------|
| Windows  | `VinylView-x.x.x-Setup.exe` |
| Linux    | `VinylView-x.x.x.AppImage` |

### Prerequisites

- A [Spotify](https://www.spotify.com) account (free or premium)
- Spotify open and playing on any device

### First launch

1. Launch Vinyl View
2. **First time only** — a setup screen asks for your Spotify Client ID
   - Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
   - Create a free app and add `http://127.0.0.1:3000/callback` as Redirect URI
   - Copy your Client ID and paste it in the setup screen
3. A Spotify login page opens in your browser — authorize the app
4. The turntable starts spinning 🎶

> Your Client ID is saved locally in `~/.config/vinyl-view/config.json` and never transmitted.

---

## 🏗️ Build from Source

### Requirements

- [Node.js](https://nodejs.org) ≥ 18
- [Rust](https://rustup.rs) ≥ 1.93
- [electron-builder](https://www.electron.build) (installed via npm)

### 1. Clone the repository

```bash
git clone https://github.com/Navexd/vinyl-view.git
cd vinyl-view
```

### 2. Build the backend (Rust)

```bash
cd backend

# Create the Cargo config with your Spotify Client ID
mkdir -p .cargo
cat > .cargo/config.toml << 'EOF'
[env]
SPOTIFY_CLIENT_ID = "your_client_id_here"
EOF

cargo build --release

> **Note:** No Spotify Client ID needed at build time — the setup screen handles it on first launch.

# Copy the binary to the frontend
cp target/release/backend ../backend-linux/backend   # Linux
# copy target\release\backend.exe ..\backend-win\backend.exe  # Windows
cd ..
```

> **Windows PowerShell:**
> ```powershell
> mkdir -Force .cargo
> @"
> [env]
> SPOTIFY_CLIENT_ID = "your_client_id_here"
> "@ | Out-File -Encoding utf8 .cargo/config.toml
> cargo build --release
> ```

### 3. Build the Electron app

```bash
npm install
npm run build:linux    # Linux AppImage
npm run build:win      # Windows NSIS installer
npm run build:all      # Both
```

Builds are output to the `release/` folder.

### 4. Development mode

```bash
# Backend — create .cargo/config.toml with your Client ID
# See backend/.cargo/config.toml.example

cd backend && cargo run &
cd ..
npm start
```

---

## ⚙️ Configuration

Settings are accessible via the **system tray icon** (right-click on Windows, click on Linux):

| Setting | Description |
|---------|-------------|
| Auto screensaver | Activates screensaver after idle timeout |
| Idle timeout | 30s / 1min / 2min / 5min / 10min |
| Notify before screensaver | Toast notification 15s before activation |
| Eco mode | 30 FPS, dimmed UI, reduced polling |
| Screensaver screen | Primary / cursor / window / specific display |
| Launch at startup | Start with the system |
| Start minimized | Start in tray without showing the window |

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `1` | Float background effect |
| `2` | Wave background effect |
| `3` | Pulse background effect |
| `F11` | Toggle fullscreen |
| `Escape` | Exit fullscreen / deactivate screensaver |

> Theme switching with `1` / `2` / `3` works in screensaver mode without deactivating it.

---

## 🏛️ Architecture

```
vinyl-view/
├── Frontend/              # Electron frontend
├── main.js                # Electron main process
├── settings.js            # Persistent settings (JSON)
├── preload.js             # Context bridge (main ↔ renderer)
├── package.json           # NPM scripts
├── privacypolicy.html     # Privacy policy page
├── build-all.sh           # Build all binaries
├── src/
│   ├── window.js          # BrowserWindow management
│   ├── screensaver.js     # Screensaver activation / idle watcher
│   ├── tray.js            # System tray menu
│   ├── ipc.js             # IPC handlers
│   ├── logger.js          # Logging
│   └── utils.js           # Path helpers, URL validation
├── renderer/
│ ├──lib/
│ │ └──color-thief.umd.js  # liverage ColorThief
│ ├── index.html
│ ├── app.js               # UI logic, polling, color extraction
│ ├── style.css            # Animated backgrounds, eco mode
│ └── record_player/
│     ├── record_player.js   # Turntable animation (RAF loop)
│     └── record_player.css  # Turntable visual styling
├── backend/                 # Rust / Warp HTTP server
│   ├── src/
│   │   ├── main.rs          # Entry point
│   │   ├── auth.rs          # Spotify OAuth PKCE
│   │   ├── routes.rs        # /login /callback /now-playing /status
│   │   ├── token.rs         # Token persistence
│   │   ├── models.rs        # TrackInfo struct
│   │   └── logger.rs        # File logging with rotation
│   └── Cargo.toml
├── assets/                  # App icons
├── backend-linux/           # Pre-built Linux binary
└── backend-win/             # Pre-built Windows binary
```

---

## 🔒 Privacy

Vinyl View is a **fully local application**. No data ever leaves your machine except to communicate with Spotify's official API.

- **Spotify token** — stored locally at `~/.config/vinyl-view/token.json`, never transmitted
- **Track data** — title, artist, album, cover art — displayed locally only
- **No analytics**, no telemetry, no external server
- **Scopes used**: `user-read-currently-playing`, `user-read-playback-state` — read-only, minimal

→ [Full Privacy Policy](https://navexd.github.io/privacy-policy)

---

## 🎨 GPU Performance (Windows)

Vinyl View is optimized for smooth animation on Windows with ANGLE/DirectX:

- D3D11 backend forced (lower ANGLE overhead than D3D9)
- GPU rasterization enabled
- Compositor-friendly CSS (`will-change: transform`, `contain: strict`)
- No `filter` on animated elements (prevents GPU layer promotion issues)
- `backgroundColor` set to avoid transparent alpha compositing pipeline

---

## 🤝 Contributing

Pull requests are welcome. For major changes, please open an issue first.

```bash
git checkout -b feature/your-feature
git commit -m "feat: your feature"
git push origin feature/your-feature
```

---

## 📋 Changelog

See [CHANGELOG.md](CHANGELOG.md) *(coming soon)*

---

## 📄 License

[MIT](LICENSE) © 2026 Navexd

---

## 🙏 Acknowledgements

- [rspotify](https://github.com/ramsayleung/rspotify) — Spotify API client for Rust
- [Warp](https://github.com/seanmonstar/warp) — Rust web framework
- [Electron](https://www.electronjs.org) — Desktop app framework
- [ColorThief](https://github.com/lokesh/color-thief) — Album color extraction

---

<div align="center">

*Navexd 2026*

</div>
