const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { createClient } = require('redis');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = 3001;

// Configuration Redis avec Fallback en mémoire
let useRedis = false;
const redisClient = createClient();

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

io.on('connection', (socket) => {
  console.log('Socket connecté:', socket.id);

  socket.on('send_message', async (data) => {
    // data contient: id, type, text (chiffré), sender, time, enc
    console.log('Message reçu du client:', data.id);
    
    // Sauvegarde Redis ou memoire
    if (useRedis) {
      await redisClient.lPush('messages:global', JSON.stringify(data));
      // Optionnel: Ne garder que les 100 derniers
      await redisClient.lTrim('messages:global', 0, 99); 
    } else {
      memoryDB.messages.push(data);
      if (memoryDB.messages.length > 100) memoryDB.messages.shift();
    }

    // Broadcast à tous les autres clients
    socket.broadcast.emit('receive_message', data);
  });

  socket.on('disconnect', () => {
    console.log('Socket déconnecté:', socket.id);
  });
});

app.get('/', (req, res) => {
  res.send('VanishText Backend is running (Redis + Socket.io)');
});

server.listen(PORT, () => {
  console.log(`🚀 Serveur backend démarré sur http://localhost:${PORT}`);
});
