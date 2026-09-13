const express = require('express');
const path = require('path');
const config = require('./config');
const db = require('./database/db');
const { createBot } = require('./bot');
const apiRoutes = require('./api/routes');

async function bootstrap() {
  console.log('🚀 Starting Telegram Task & Verification Bot + Mini App Server...');

  // Initialize Database
  try {
    await db.init();
  } catch (dbErr) {
    console.error('❌ Failed to initialize database:', dbErr);
    process.exit(1);
  }

  if (!config.botToken) {
    console.error('❌ Error: BOT_TOKEN is missing in .env file!');
    console.log('👉 Please create a .env file and add your Telegram bot token.');
    process.exit(1);
  }

  const bot = createBot();

  // Setup Express server (Serves Mini App Frontend & REST APIs)
  const app = express();
  app.use(express.json());
  app.set('telegramBot', bot);

  // Serve Mini App static files from public/
  app.use(express.static(path.join(__dirname, '../public')));

  // REST API Routes
  app.use('/api', apiRoutes);

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.status(200).send('OK');
  });

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

  // Fallback all unhandled routes to index.html for SPA Mini App
  app.use((req, res, next) => {
    if (req.method === 'GET') {
      return res.sendFile(path.join(__dirname, '../public/index.html'));
    }
    next();
  });

  // Webhook vs Polling Mode
  if (config.webhookDomain) {
    const webhookPath = `/webhook`;
    const fullWebhookUrl = `${config.webhookDomain.replace(/\/$/, '')}${webhookPath}`;

    app.use(bot.webhookCallback(webhookPath));

    app.listen(config.port, '0.0.0.0', async () => {
      console.log(`🌐 Web & Mini App server listening on port ${config.port}`);
      try {
        await bot.telegram.setWebhook(fullWebhookUrl);
        console.log(`✅ Webhook set successfully to: ${fullWebhookUrl}`);
      } catch (err) {
        console.error('❌ Failed to set webhook:', err.message);
      }
    });
  } else {
    app.listen(config.port, '0.0.0.0', () => {
      console.log(`🌐 Mini App Web server running at http://0.0.0.0:${config.port}`);
    });

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
