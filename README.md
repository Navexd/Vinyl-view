📝 Proposition de README enrichi

⚠️ Ne jamais commit vos secrets ( est ignoré via ).

🚀 Installation & Lancement
Backend

Le backend démarre sur .
Première étape : ouvrez  pour authentifier votre compte Spotify. Le token est ensuite sauvegardé dans .
Frontend

Le frontend Electron s’ouvre en fullscreen et affiche vos musiques en cours de lecture.

📦 Build & Release
Compiler le backend

Le binaire est généré dans .
Packager le frontend

Vous obtenez un exécutable Electron dans .

🌟 Fonctionnalités
• 	Authentification Spotify OAuth2
• 	Récupération du morceau en cours (titre, artiste, pochette)
• 	Extraction des couleurs dominantes de la pochette
• 	UI fullscreen animée
• 	Rafraîchissement dynamique quand la musique change
• 	Persistance du token pour éviter de se reconnecter à chaque lancement

🔮 Roadmap
• 	🎨 Fond dynamique basé sur les couleurs de la pochette
• 	🔊 Visualiseur audio synchronisé
• 	🌙 Intégration comme économiseur d’écran système
• 	🎭 Thèmes et transitions personnalisés

🤝 Contribution
Les PR sont les bienvenues !
Merci de respecter la structure du projet et d’ajouter une documentation claire pour vos ajouts.

⚠️ Licence
Projet personnel — usage libre pour tests et inspiration.
Spotify est une marque déposée de Spotify AB.
