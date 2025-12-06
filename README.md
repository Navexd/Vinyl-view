Parfait Evan 👌, voici une version complète et mise à jour de ton **README global** pour GitHub. Elle reprend ton contenu initial mais enrichi avec les sections essentielles (description, installation, configuration, build, roadmap, contribution, licence).  

---

# 🎧 Vinyl-View — Économiseur d’écran Spotify

Un économiseur d’écran dynamique qui réagit aux musiques que vous écoutez sur Spotify.  
Le projet combine un **backend Rust** (authentification Spotify + récupération des morceaux) et un **frontend Electron** (interface fullscreen animée).

---

## ⚙️ Prérequis

- [Rust](https://www.rust-lang.org/tools/install) (pour compiler le backend)  
- [Node.js](https://nodejs.org/) + npm (pour le frontend Electron)  
- Un compte [Spotify Developer](https://developer.spotify.com/dashboard) pour créer une application et obtenir vos identifiants OAuth2  

---

## 🔐 Configuration

Dans `backend/.env`, ajoutez vos identifiants Spotify :

```env
RSPOTIFY_CLIENT_ID=your_client_id
RSPOTIFY_CLIENT_SECRET=your_client_secret
RSPOTIFY_REDIRECT_URI=http://127.0.0.1:3000/callback
```

⚠️ Ne jamais commit vos secrets (`.env` est ignoré via `.gitignore`).

---

## 🚀 Installation & Lancement

### Backend
```bash
cd backend
cargo run
```
Le backend démarre sur `http://127.0.0.1:3000`.  
Première étape : ouvrez `/login` pour authentifier votre compte Spotify. Le token est ensuite sauvegardé dans `token.json`.

### Frontend
```bash
cd frontend
npm install
npm start
```
Le frontend Electron s’ouvre en fullscreen et affiche vos musiques en cours de lecture.

---

## 📦 Build & Release

### Compiler le backend
```bash
cd backend
cargo build --release
```
Le binaire est généré dans `backend/target/release/backend.exe`.

### Packager le frontend
```bash
cd frontend
npm install
npx electron-packager . VinylView --platform=win32 --arch=x64 --out=dist
```
Vous obtenez un exécutable Electron dans `frontend/dist/`.

👉 Pour une release GitHub, regroupez :
- `VinylView.exe` (frontend Electron)  
- `backend.exe` (backend Rust)  
- `README-release.txt` (instructions rapides)  
- Dossiers `resources/` et `locales/` si Electron les a générés  

---

## 🌟 Fonctionnalités

- Authentification Spotify OAuth2  
- Persistance du token (`token.json`)  
- Récupération du morceau en cours (titre, artiste, pochette)  
- Extraction des couleurs dominantes de la pochette  
- UI fullscreen animée  
- Rafraîchissement automatique quand la musique change  

---

## 🔮 Roadmap

- 🎨 Fond dynamique basé sur les couleurs de la pochette  
- 🔊 Visualiseur audio synchronisé  
- 🌙 Intégration comme économiseur d’écran système  
- 🎭 Thèmes et transitions personnalisés  

---

## 🤝 Contribution

Les PR sont les bienvenues !  
Merci de respecter la structure du projet et d’ajouter une documentation claire pour vos ajouts.

---

## ⚠️ Licence

Projet personnel — usage libre pour tests et inspiration.  
Spotify est une marque déposée de Spotify AB.

---


