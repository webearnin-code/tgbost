const { Telegraf } = require('telegraf');
const config = require('./config');
const db = require('./database/db');

// Handlers
const { handleStart } = require('./handlers/start');
const { handleShowTasks, handleViewTaskDetails, handleVerifyTask } = require('./handlers/tasks');
const {
  handleShowWallet,
  handleStartWithdraw,
  handleSelectWithdrawMethod,
  handleWithdrawText,
  handleConfirmWithdraw,
  handleCancelWithdraw,
  handleWithdrawHistory
} = require('./handlers/wallet');
const { handleShowReferral } = require('./handlers/referral');
const { handleHelp } = require('./handlers/help');
const {
  handleAdminPanel,
  handleAdminAddTaskStart,
  handleAdminManageTasks,
  handleAdminTaskDetail,
  handleAdminToggleTask,
  handleAdminDeleteTask,
  handleAdminPendingWithdrawals,
  handleAdminApproveWithdrawal,
  handleAdminRejectWithdrawal,
  handleAdminBroadcastStart,
  handleAdminText
} = require('./handlers/admin');

function createBot() {
  if (!config.botToken) {
    console.error('❌ ERROR: BOT_TOKEN is missing in .env file!');
  }

  const bot = new Telegraf(config.botToken);

  // Global error handler
  bot.catch((err, ctx) => {
    console.error(`Error in bot update (${ctx.updateType}):`, err);
  });

  // Middleware to automatically track/update user in database
  bot.use(async (ctx, next) => {
    if (ctx.from) {
      try {
        await db.getOrCreateUser(ctx.from);
      } catch (e) {
        // silent fail to not block bot flow
      }
    }
    return next();
  });

  // Bot commands
  bot.command('start', handleStart);
  bot.command('tasks', handleShowTasks);
  bot.command('wallet', handleShowWallet);
  bot.command('withdraw', handleStartWithdraw);
  bot.command('referral', handleShowReferral);
  bot.command('help', handleHelp);
  bot.command('admin', handleAdminPanel);

  // Reply Keyboard text listeners (Clean English)
  bot.hears(/^(Available Tasks|📋 Available Tasks)/i, handleShowTasks);
  bot.hears(/^(My Wallet|💰 My Wallet)/i, handleShowWallet);
  bot.hears(/^(Withdraw Funds|💳 Withdraw Funds)/i, handleStartWithdraw);
  bot.hears(/^(Invite & Earn|Invite and Earn|👥 Invite & Earn)/i, handleShowReferral);
  bot.hears(/^(Rules & Guide|Rules and Guide|ℹ️ Rules & Guide)/i, handleHelp);
  bot.hears(/^(Admin Dashboard|⚙️ Admin Dashboard)/i, handleAdminPanel);

  // Callback Queries for Tasks
  bot.action('tasks_list', handleShowTasks);
  bot.action(/^task_view_(\d+)$/, (ctx) => handleViewTaskDetails(ctx, ctx.match[1]));
  bot.action(/^verify_task_(\d+)$/, (ctx) => handleVerifyTask(ctx, ctx.match[1]));

  // Callback Queries for Wallet & Withdrawals
  bot.action('my_wallet', handleShowWallet);
  bot.action('refresh_wallet', async (ctx) => {
    await ctx.answerCbQuery('🔄 Balance updated');
    await handleShowWallet(ctx);
  });
  bot.action('start_withdraw', handleStartWithdraw);
  bot.action('withdraw_history', handleWithdrawHistory);
  bot.action(/^withdraw_method_(.+)$/, (ctx) => handleSelectWithdrawMethod(ctx, ctx.match[1]));
  bot.action('confirm_withdraw', handleConfirmWithdraw);
  bot.action('cancel_withdraw', handleCancelWithdraw);

  // Callback Queries for Referral
  bot.action('refresh_referral', async (ctx) => {
    await ctx.answerCbQuery('🔄 Referral stats updated');
    await handleShowReferral(ctx);
  });

  // Callback Queries for Admin
  bot.action('admin_panel', handleAdminPanel);
  bot.action('admin_stats', handleAdminPanel);
  bot.action('admin_add_task', handleAdminAddTaskStart);
  bot.action('admin_manage_tasks', handleAdminManageTasks);
  bot.action(/^admin_task_detail_(\d+)$/, (ctx) => handleAdminTaskDetail(ctx, ctx.match[1]));
  bot.action(/^admin_task_toggle_(\d+)$/, (ctx) => handleAdminToggleTask(ctx, ctx.match[1]));
  bot.action(/^admin_task_delete_(\d+)$/, (ctx) => handleAdminDeleteTask(ctx, ctx.match[1]));
  bot.action('admin_pending_withdrawals', handleAdminPendingWithdrawals);
  bot.action(/^admin_approve_(\d+)$/, (ctx) => handleAdminApproveWithdrawal(ctx, ctx.match[1]));
  bot.action(/^admin_reject_(\d+)$/, (ctx) => handleAdminRejectWithdrawal(ctx, ctx.match[1]));
  bot.action('admin_broadcast', handleAdminBroadcastStart);

  // Catch-all text messages for interactive wizards (Admin task entry & User cashout)
  bot.on('text', async (ctx, next) => {
    const adminHandled = await handleAdminText(ctx);
    if (adminHandled) return;

    const withdrawHandled = await handleWithdrawText(ctx);
    if (withdrawHandled) return;

    return next();
  });

  // Catch media for broadcast
  bot.on(['photo', 'video', 'document'], async (ctx, next) => {
    const adminHandled = await handleAdminText(ctx);
    if (adminHandled) return;
    return next();
  });

  return bot;
}

module.exports = {
  createBot
};
