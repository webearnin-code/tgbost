const { Markup } = require('telegraf');
const db = require('../database/db');
const config = require('../config');

async function handleShowReferral(ctx) {
  try {
    const userId = ctx.from.id;
    const botInfo = await ctx.telegram.getMe();
    const botUsername = botInfo.username;

    const affiliate = await db.getAffiliateData(userId);
    const refLink = affiliate.referralLink || `https://t.me/${botUsername}?start=${affiliate.referralCode}`;

    const shareText = encodeURIComponent(
      `Join Telegram channels and earn daily cash rewards with instant payouts!\n` +
      `Start earning today on TG BOOST:\n${refLink}`
    );
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${shareText}`;

    const msg =
      `<b>👥 Referral and Affiliate Program:</b>\n\n` +
      `Share your personal invite link with friends and earn cash rewards for every active member.\n\n` +
      `• Reward per Referral: <b>+${config.referralReward.toFixed(2)} ${config.currency}</b>\n` +
      `• Total Invites: <b>${affiliate.totalInvites} members</b>\n` +
      `• Active Invites: <b>${affiliate.activeInvites} members</b>\n` +
      `• Pending Invites: <b>${affiliate.pendingInvites} members</b>\n` +
      `• Total Affiliate Earnings: <b>${affiliate.totalEarned} ${config.currency}</b>\n\n` +
      `<i>Note: When an invited member refers at least 1 friend, they become Active and your +${config.referralReward.toFixed(2)} ${config.currency} reward is credited!</i>\n\n` +
      `<b>Your Exclusive Referral Link:</b>\n` +
      `<code>${refLink}</code>\n\n` +
      `📢 <b>Want to promote your Channel / Group?</b>\n` +
      `Contact our official agent to get real active Telegram members: @TgBoost_Ajent`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.url('Share on Telegram', shareUrl)],
      [Markup.button.url('Promote Channel (@TgBoost_Ajent)', 'https://t.me/TgBoost_Ajent')],
      [Markup.button.callback('🔄 Refresh Stats', 'refresh_referral')]
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
