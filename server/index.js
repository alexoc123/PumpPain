require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const whatsappRoutes = require('./routes/whatsapp');
const pricesRoutes = require('./routes/prices');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
}));
app.use(express.json());

app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/prices', pricesRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Serve React build in production
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(clientDist));
  app.get('/{*splat}', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`PumpPain server running on port ${PORT}`);
});
