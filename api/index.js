const express = require('express');
const config = require('../src/config');
const db = require('../src/database/db');
const { createBot } = require('../src/bot');
const apiRoutes = require('../src/api/routes');

const app = express();
app.use(express.json());

let isDbInit = false;
let bot = null;

// Middleware to ensure DB and Bot instance are ready
app.use(async (req, res, next) => {
  try {
    if (!isDbInit) {
      await db.init();
      isDbInit = true;
    }
    if (!bot) {
      bot = createBot();
      app.set('telegramBot', bot);
    }
    next();
  } catch (err) {
    console.error('Serverless initialization error:', err);
    res.status(500).json({ error: 'Initialization error: ' + err.message });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    bot: 'TG BOOST MONETIZE',
    serverless: true,
    timestamp: new Date().toISOString()
  });
});

// Telegram Webhook endpoint
app.post('/webhook', async (req, res) => {
  try {
    await bot.handleUpdate(req.body, res);
    if (!res.headersSent) {
      res.status(200).send('OK');
    }
  } catch (err) {
    console.error('Webhook error:', err);
    if (!res.headersSent) {
      res.status(500).send('Webhook Error');
    }
  }
});

// Mount Mini App REST API
app.use('/api', apiRoutes);

module.exports = app;
