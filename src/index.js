const express = require('express');
const path = require('path');
const config = require('./config');
const db = require('./database/db');
const { createBot } = require('./bot');
const apiRoutes = require('./api/routes');
const { startHoldingVerificationScheduler } = require('./tasks/verifier');

async function bootstrap() {
  console.log('🚀 Starting Telegram Task & Verification Bot + Mini App Server...');

  // Setup Express server immediately so health checks pass on cloud providers (Render / Koyeb / Vercel)
  const app = express();
  app.use(express.json());

  // Health check endpoint (Always available)
  app.get('/health', (req, res) => {
    res.status(200).send('OK');
  });

  // Serve Mini App static files from public/
  app.use(express.static(path.join(__dirname, '../public')));

  // REST API Routes
  app.use('/api', apiRoutes);

  // Web Referral Redirect Routes (Clean website links: /r/:code, /ref/:code, /join/:code)
  app.get(['/r/:code', '/ref/:code', '/join/:code'], (req, res) => {
    const rawCode = req.params.code;
    const botUser = config.botUsername || 'TgBoost_Monetizebot';
    
    let startPayload = rawCode;
    if (/^\d{5,7}$/.test(rawCode)) {
      startPayload = `TgBoost_Monetize${rawCode}`;
    }

    const tgBotUrl = `https://t.me/${botUser}?start=${encodeURIComponent(startPayload)}`;

    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Opening TG BOOST...</title>
  <meta http-equiv="refresh" content="0; url=${tgBotUrl}">
  <style>
    body {
      margin: 0;
      padding: 24px;
      min-height: 100vh;
      background: radial-gradient(circle at 50% 20%, rgba(36, 161, 222, 0.18), transparent 75%), #0c141d;
      color: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      text-align: center;
    }
    .card {
      background: rgba(22, 27, 34, 0.9);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 24px;
      padding: 36px 24px;
      max-width: 400px;
      width: 100%;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6), 0 0 50px rgba(36, 161, 222, 0.15);
      backdrop-filter: blur(20px);
    }
    .tg-img {
      width: 76px;
      height: 76px;
      border-radius: 50%;
      margin-bottom: 18px;
      box-shadow: 0 8px 24px rgba(36, 161, 222, 0.35);
    }
    h2 {
      margin: 0 0 8px 0;
      font-size: 22px;
      font-weight: 800;
    }
    p {
      color: #8b949e;
      font-size: 13.5px;
      line-height: 1.55;
      margin: 0 0 22px 0;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      width: 100%;
      padding: 14px 20px;
      background: linear-gradient(135deg, #24A1DE, #1976D2);
      color: #ffffff;
      font-size: 15px;
      font-weight: 700;
      text-decoration: none;
      border-radius: 14px;
      box-sizing: border-box;
      box-shadow: 0 6px 20px rgba(36, 161, 222, 0.35);
    }
  </style>
  <script>
    window.location.href = "${tgBotUrl}";
  </script>
</head>
<body>
  <div class="card">
    <img src="/img/telegram.svg" class="tg-img" alt="Telegram">
    <h2>Connecting to TG BOOST</h2>
    <p>Opening official Telegram channel bot. Tap below if not redirected automatically.</p>
    <a href="${tgBotUrl}" class="btn">Open in Telegram</a>
  </div>
</body>
</html>`);
  });

  // Fallback all unhandled GET routes to index.html for SPA Mini App
  app.use((req, res, next) => {
    if (req.method === 'GET') {
      return res.sendFile(path.join(__dirname, '../public/index.html'));
    }
    next();
  });

  // Start HTTP Server immediately
  const server = app.listen(config.port, '0.0.0.0', () => {
    console.log(`🌐 Mini App Web server running at http://0.0.0.0:${config.port}`);
  });

  // Initialize Database in background
  try {
    await db.init();
  } catch (dbErr) {
    console.error('❌ Failed to initialize database:', dbErr);
    process.exit(1);
  }

  if (!config.botToken) {
    console.error('❌ Error: BOT_TOKEN is missing in .env file!');
    console.log('👉 Please add your Telegram bot token in settings.');
    return;
  }

  const bot = createBot();
  app.set('telegramBot', bot);

  // Start 2-Day Holding Verification Scheduler (runs every 10 mins)
  startHoldingVerificationScheduler(bot, 10);

  // Register commands in Telegram UI
  try {
    await bot.telegram.setMyCommands([
      { command: 'start', description: 'Start Bot (Main Menu)' },
      { command: 'tasks', description: 'Available Tasks & Earn' },
      { command: 'wallet', description: 'My Wallet & Balance' },
      { command: 'withdraw', description: 'Withdraw Funds' },
      { command: 'referral', description: 'Invite Friends & Earn' },
      { command: 'help', description: 'Rules & Guidelines' },
      { command: 'admin', description: 'Admin Dashboard' }
    ]);
    console.log('✅ Telegram bot menu commands registered');

    // Set bottom-left "Open" menu button in Telegram chat
    const appUrl = config.miniAppUrl || config.webhookDomain;
    if (appUrl) {
      try {
        await bot.telegram.callApi('setChatMenuButton', {
          menu_button: {
            type: 'web_app',
            text: 'Open',
            web_app: { url: appUrl }
          }
        });
        console.log(`✅ Telegram Menu Button set to "Open" with URL: ${appUrl}`);
      } catch (btnErr) {
        console.warn('⚠️ Could not set menu button on startup:', btnErr.message);
      }
    }
  } catch (cmdErr) {
    console.warn('⚠️ Could not set bot menu commands:', cmdErr.message);
  }

  // Webhook vs Polling Mode
  if (config.webhookDomain) {
    const webhookPath = `/webhook`;
    const fullWebhookUrl = `${config.webhookDomain.replace(/\/$/, '')}${webhookPath}`;

    app.use(bot.webhookCallback(webhookPath));
    try {
      await bot.telegram.setWebhook(fullWebhookUrl);
      console.log(`✅ Webhook set successfully to: ${fullWebhookUrl}`);
    } catch (err) {
      console.error('❌ Failed to set webhook:', err.message);
    }
  } else {
    try {
      await bot.telegram.deleteWebhook();
    } catch (e) {}

    console.log('🤖 Starting Telegram Bot polling...');
    bot.launch({
      dropPendingUpdates: true
    }).then(() => {
      console.log('🛑 Bot polling stopped.');
    }).catch((err) => {
      console.error('❌ Failed to launch bot polling:', err);
    });
  }

  // Graceful shutdown
  const stopBot = (signal) => {
    console.log(`\n🛑 Received ${signal}. Stopping bot...`);
    try {
      bot.stop(signal);
    } catch (e) {}
    process.exit(0);
  };

  process.once('SIGINT', () => stopBot('SIGINT'));
  process.once('SIGTERM', () => stopBot('SIGTERM'));
}

bootstrap().catch(err => {
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
