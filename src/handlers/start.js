const db = require('../database/db');
const config = require('../config');
const { getMainKeyboard, getMiniAppButton } = require('../keyboards/mainKeyboard');

async function handleStart(ctx) {
  try {
    const telegramUser = ctx.from;
    const startPayload = ctx.message && ctx.message.text ? ctx.message.text.split(' ')[1] : null;
    const { user, isNew, referrerId: validRef, qualifiedReferral } = await db.getOrCreateUser(telegramUser, startPayload);

    // Notify referrer that a new pending member joined
    if (isNew && validRef) {
      try {
        const refName = telegramUser.first_name || telegramUser.username || 'New Member';
        await ctx.telegram.sendMessage(
          validRef,
          `👥 <b>New Referral Joined!</b>\n\n` +
          `User: <b>${refName}</b> joined using your referral link.\n` +
          `Status: <b>⏳ Pending</b>\n` +
          `Once this member refers at least 1 friend, your <b>+${config.referralReward.toFixed(2)} ${config.currency}</b> reward will be credited!`,
          { parse_mode: 'HTML' }
        );
      } catch (err) {
        console.error('Error sending referral notification to referrer:', err.message);
      }
    }

    // If a referral just qualified (i.e. User B just referred this new user and qualified User A)
    if (qualifiedReferral) {
      try {
        await ctx.telegram.sendMessage(
          qualifiedReferral.rewardedUserId,
          `🎉 <b>Referral Bonus Activated!</b>\n\n` +
          `Your invited member <b>${qualifiedReferral.qualifiedUser.first_name || qualifiedReferral.qualifiedUser.username || 'Member'}</b> referred a new user and is now Active!\n` +
          `You earned: <b>+${qualifiedReferral.rewardAmount.toFixed(2)} ${config.currency}</b> (credited to your main balance)`,
          { parse_mode: 'HTML' }
        );
      } catch (err) {
        console.error('Error sending referral activation notification:', err.message);
      }
    }

    const firstName = telegramUser.first_name || 'Member';
    const welcomeMsg =
      `<b>Welcome, ${firstName}!</b>\n\n` +
      `Welcome to <b>TG BOOST</b> - your platform to earn rewards by joining verified Telegram channels and groups.\n\n` +
      `<b>How it works:</b>\n` +
      `1. Tap <b>"Available Tasks"</b> to view active channels.\n` +
      `2. Click the link to join the required channel or group.\n` +
      `3. Return here and tap <b>"Verify"</b> to claim your reward.\n` +
      `4. Withdraw your earnings via BDT (bKash/Nagad) or USDT (Binance ID).\n\n` +
      `Use the buttons below to get started:`;

    const webAppUrl = config.miniAppUrl || config.webhookDomain || null;
    const inlineKb = getMiniAppButton(webAppUrl);

    // Set Telegram bottom-left Chat Menu Button to "Open"
    if (webAppUrl) {
      try {
        await ctx.telegram.callApi('setChatMenuButton', {
          chat_id: ctx.chat.id,
          menu_button: {
            type: 'web_app',
            text: 'Open',
            web_app: { url: webAppUrl }
          }
        });
      } catch (e) {}
    }

    await ctx.reply(welcomeMsg, {
      parse_mode: 'HTML',
      ...getMainKeyboard(telegramUser, webAppUrl)
    });

    // Send Mini App launcher card if URL is configured
    if (webAppUrl) {
      await ctx.reply(
        `<b>Mini App Experience:</b>\n\n` +
        `Open the Mini App for visual task verification, wallet management, and fast withdrawals.`,
        {
          parse_mode: 'HTML',
          ...inlineKb
        }
      );
    }
  } catch (error) {
    console.error('Error in handleStart:', error);
    await ctx.reply('Something went wrong. Please try again shortly.');
  }
}

module.exports = {
  handleStart
};
