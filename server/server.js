const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
const server = http.createServer(app);

const PORT = process.env.PORT || 3001;

// Serve static files from the root dist folder
app.use(express.static(path.join(__dirname, '../dist')));

app.get('/api', (req, res) => {
  res.send('VanishText Static Edge Server is running (Supabase Serverless mode)');
});

// Fallback to index.html for React Router (SPA routing)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist', 'index.html'));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Serveur backend démarré sur http://localhost:${PORT}`);
  console.log(`✅ Architecture Serverless : Routage SPA actif, logique Déléguée à Supabase.`);
});
