const { Markup } = require('telegraf');
const db = require('../database/db');
const config = require('../config');

async function handleShowReferral(ctx) {
  try {
    const userId = ctx.from.id;
    const user = await db.getUser(userId);
    const botInfo = await ctx.telegram.getMe();
    const botUsername = botInfo.username;

    const refLink = `https://t.me/${botUsername}?start=ref_${userId}`;
    const refCount = user ? user.referral_count || 0 : 0;
    const totalRefEarned = (refCount * config.referralReward).toFixed(2);

    const shareText = encodeURIComponent(
      `Join Telegram channels and earn daily cash rewards with instant payouts!\n` +
      `Start earning today on TG BOOST:\n${refLink}`
    );
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${shareText}`;

    const msg =
      `<b>Referral and Affiliate Program:</b>\n\n` +
      `Share your personal invite link with friends and earn cash rewards for every successful invite.\n\n` +
      `Reward per Referral: <b>+${config.referralReward.toFixed(2)} ${config.currency}</b>\n` +
      `Your Successful Invites: <b>${refCount} members</b>\n` +
      `Total Referral Earnings: <b>${totalRefEarned} ${config.currency}</b>\n\n` +
      `Your Exclusive Referral Link:\n` +
      `<code>${refLink}</code>\n\n` +
      `Copy the link or tap the button below to share directly on Telegram:`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.url('Share on Telegram', shareUrl)],
      [Markup.button.callback('Refresh Stats', 'refresh_referral')]
    ]);

    if (ctx.callbackQuery) {
      await ctx.editMessageText(msg, { parse_mode: 'HTML', ...keyboard });
    } else {
      await ctx.reply(msg, { parse_mode: 'HTML', ...keyboard });
    }
  } catch (err) {
    console.error('Error in handleShowReferral:', err);
    await ctx.reply('Could not load referral program.');
  }
}

module.exports = {
  handleShowReferral
};
