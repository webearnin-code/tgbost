const config = require('../config');

async function handleHelp(ctx) {
  const msg =
    `<b>Rules and Guidelines:</b>\n\n` +
    `1. <b>How to Complete Tasks:</b>\n` +
    `   - Tap "Available Tasks" or open the Mini App to view current channels.\n` +
    `   - Tap "Join Channel" to join the required public/private community.\n` +
    `   - Return and tap "Verify Membership". Our automated bot checks your membership in real-time and credits your balance.\n\n` +
    `2. <b>Anti-Cheat Policy:</b>\n` +
    `   - Leaving a channel or group after receiving payment is strictly prohibited. Automated periodic checks detect departures and freeze account balances.\n` +
    `   - Fake referrals, botting, or multiple accounts are strictly prohibited.\n\n` +
    `3. <b>Payout Terms:</b>\n` +
    `   - Minimum BDT withdrawal (bKash/Nagad/Rocket): ${config.minWithdraw} ${config.currency}.\n` +
    `   - Minimum USDT withdrawal (Binance ID): $${config.minWithdrawUsdt.toFixed(2)} USDT.\n` +
    `   - Requests are reviewed and disbursed promptly.\n\n` +
    `For inquiries and business partnerships, please contact support.`;

  if (ctx.callbackQuery) {
    await ctx.editMessageText(msg, { parse_mode: 'HTML' });
  } else {
    await ctx.reply(msg, { parse_mode: 'HTML' });
  }
}

module.exports = {
  handleHelp
};
