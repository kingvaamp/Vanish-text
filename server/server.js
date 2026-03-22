const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { createClient } = require('redis');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3001;

// Configuration Redis avec Fallback en mémoire
let useRedis = false;
const redisClient = createClient({
  url: process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => {
  console.log('⚠️ Redis configuration non disponible localement. Utilisation du fallback en mémoire rapide.');
});

redisClient.connect().then(() => {
  console.log('✅ Connecté à Redis avec succès.');
  useRedis = true;
}).catch(() => {
  console.log('⚠️ Erreur connexion Redis (le serveur Redis ne tourne peut-être pas?). Mode mémoire activé.');
});

// Fallback Memoire
const memoryDB = { messages: [] };

// Annuaire Public des Utilisateurs Actifs (PKI)
const activeUsers = {}; // socket.id -> { publicKey }

io.on('connection', (socket) => {
  console.log('Socket connecté:', socket.id);

  // Étape 2: Alice enregistre sa clé publique sur l'annuaire
  socket.on('register_identity', (publicKey) => {
    if (!publicKey || typeof publicKey !== 'string') return;
    activeUsers[socket.id] = { publicKey };
    console.log(`🔑 Clé publique enregistrée pour ${socket.id}`);
    
    // Diffuser la mise à jour de l'annuaire à tout le monde
    io.emit('directory_update', activeUsers);
  });

  socket.on('send_message', async (data) => {
    // Sécurité: Le payload est désormais un objet contenant les messages chiffrés pour CHAQUE destinataire
    if (!data || typeof data !== 'object' || !data.id || typeof data.ciphertexts !== 'object' || !data.sender) {
      console.log('⚠️ Rejet sécuritaire: Payload malformé ou non-N-Way E2E.');
      return;
    }

    console.log(`Relais du message ${data.id} chiffré pour ${Object.keys(data.ciphertexts).length} destinataires.`);
    socket.broadcast.emit('receive_message', data);
  });

  socket.on('disconnect', () => {
    console.log('Socket déconnecté:', socket.id);
    delete activeUsers[socket.id];
    io.emit('directory_update', activeUsers);
  });
});

// Serve static files from the root dist folder
app.use(express.static(path.join(__dirname, '../dist')));

app.get('/api', (req, res) => {
  res.send('VanishText Backend is running (Redis + Socket.io)');
});

// Fallback to index.html for React Router (SPA routing)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist', 'index.html'));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Serveur backend démarré sur http://localhost:${PORT}`);
});
