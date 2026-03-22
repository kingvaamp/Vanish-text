// 🚀 HIJACK EXCLUSIF POUR RENDER.COM 🚀
// Render force l'exécution de "node index.js" dans les paramètres par défaut du Dashboard de l'utilisateur.
// Pour contourner ce forçage Node.js (qui causait le crash ES Modules ERR_MODULE_NOT_FOUND),
// ce fichier index.js va démarrer officiellement le serveur Node.js backend.
//
// L'application React/Expo (le front-end original) a été déplacée vers "expo-index.js".
//
require('./server/server.js');
