require('dotenv').config();

const config = {
  // Telegram Bot Token from @BotFather
  botToken: process.env.BOT_TOKEN || '',

  // Admin Telegram User IDs (array of numbers or strings)
  adminIds: (process.env.ADMIN_IDS || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean),

  // Minimum withdraw amount in BDT (টাকা)
  minWithdraw: parseFloat(process.env.MIN_WITHDRAW || '20'),

  // Referral reward in BDT (টাকা)
  referralReward: parseFloat(process.env.REFERRAL_REWARD || '1.0'),

  // Currency symbol or name
  currency: process.env.CURRENCY || '৳',

  // USDT Settings (Binance Pay)
  usdtRate: parseFloat(process.env.USDT_RATE || '120'), // 1 USDT = 120 ৳
  minWithdrawUsdt: parseFloat(process.env.MIN_WITHDRAW_USDT || '1.0'), // Min $1.00 USDT

  // Database URL (Postgres) or empty for SQLite
  databaseUrl: process.env.DATABASE_URL || '',

  // Webhook settings (for Vercel / Render / Cloudflare / Free Hosting)
  webhookDomain: process.env.WEBHOOK_DOMAIN || '', // e.g. https://your-app.vercel.app or https://your-app.onrender.com
  port: parseInt(process.env.PORT || '3000', 10),

  // Channel where withdraw proof or logs will be sent (Optional)
  paymentLogChannel: process.env.PAYMENT_LOG_CHANNEL || '',

  // Helper to check if user is admin (supports user ID or username)
  isAdmin(userOrId) {
    if (!userOrId) return false;
    const adminList = this.adminIds.map(a => a.toLowerCase().replace('@', ''));
    if (typeof userOrId === 'object') {
      const idStr = String(userOrId.id || '').toLowerCase();
      const userStr = String(userOrId.username || '').toLowerCase().replace('@', '');
      return adminList.includes(idStr) || (userStr && adminList.includes(userStr));
    }
    const checkStr = String(userOrId).toLowerCase().replace('@', '');
    return adminList.includes(checkStr);
  }
};

module.exports = config;
