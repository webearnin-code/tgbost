const { Markup } = require('telegraf');
const db = require('../database/db');
const config = require('../config');

// Show list of available tasks for the user
async function handleShowTasks(ctx) {
  try {
    const userId = ctx.from.id;
    const tasks = await db.getActiveTasksForUser(userId);

    if (!tasks || tasks.length === 0) {
      const msg =
        `<b>No tasks available right now!</b>\n\n` +
        `You have either completed all available tasks or no new channels have been listed yet.\n` +
        `Please check back soon for new earning opportunities.`;

      const kb = Markup.inlineKeyboard([
        [Markup.button.callback('Refresh Tasks', 'tasks_list')]
      ]);

      if (ctx.callbackQuery) {
        return await ctx.editMessageText(msg, { parse_mode: 'HTML', ...kb });
      } else {
        return await ctx.reply(msg, { parse_mode: 'HTML', ...kb });
      }
    }

    let msg = `<b>Available Tasks (${tasks.length}):</b>\n\n`;
    msg += `Select any task below, join the channel, and claim your cash reward:\n`;

    const buttons = tasks.map((task, idx) => {
      const rewardFormatted = parseFloat(task.reward).toFixed(2);
      return [
        Markup.button.callback(
          `[${idx + 1}] ${task.title} (+${rewardFormatted} ${config.currency})`,
          `task_view_${task.id}`
        )
      ];
    });

    buttons.push([Markup.button.callback('Refresh List', 'tasks_list')]);

    const keyboard = Markup.inlineKeyboard(buttons);

    if (ctx.callbackQuery) {
      await ctx.editMessageText(msg, { parse_mode: 'HTML', ...keyboard });
    } else {
      await ctx.reply(msg, { parse_mode: 'HTML', ...keyboard });
    }
  } catch (err) {
    console.error('Error in handleShowTasks:', err);
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery('Failed to load tasks.');
    } else {
      await ctx.reply('Failed to load tasks. Please try again shortly.');
    }
  }
}

// Show specific task details with Join & Verify buttons
async function handleViewTaskDetails(ctx, taskId) {
  try {
    const userId = ctx.from.id;
    const task = await db.getTask(taskId);

    if (!task || task.is_active !== 1) {
      await ctx.answerCbQuery('This task is no longer active!', { show_alert: true });
      return handleShowTasks(ctx);
    }

    const isCompleted = await db.isTaskCompletedByUser(userId, taskId);
    if (isCompleted) {
      await ctx.answerCbQuery('You have already completed this task!', { show_alert: true });
      return handleShowTasks(ctx);
    }

    const rewardFormatted = parseFloat(task.reward).toFixed(2);
    const msg =
      `<b>Task Details:</b>\n\n` +
      `Task: ${task.title}\n` +
      `Reward: <b>+${rewardFormatted} ${config.currency}</b>\n` +
      (task.description ? `Description: ${task.description}\n` : '') +
      `\nInstructions:\n` +
      `1. Tap <b>"Join Channel"</b> below to join the channel or group.\n` +
      `2. Return to this bot and tap <b>"Verify Membership"</b>.\n` +
      `3. Once verified, your wallet will be credited instantly.\n\n` +
      `(Notice: Leaving the channel after claiming may lead to account penalties.)`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.url('Join Channel', task.channel_link)],
      [Markup.button.callback('Verify Membership', `verify_task_${task.id}`)],
      [Markup.button.callback('Back to Tasks', 'tasks_list')]
    ]);

    await ctx.editMessageText(msg, { parse_mode: 'HTML', ...keyboard });
  } catch (err) {
    console.error('Error in handleViewTaskDetails:', err);
    await ctx.answerCbQuery('Could not load task details.');
  }
}

// Handle Verification when user clicks Verify
async function handleVerifyTask(ctx, taskId) {
  try {
    const userId = ctx.from.id;
    const task = await db.getTask(taskId);

    if (!task) {
      return ctx.answerCbQuery('Task not found!', { show_alert: true });
    }

    const alreadyCompleted = await db.isTaskCompletedByUser(userId, taskId);
    if (alreadyCompleted) {
      return ctx.answerCbQuery('You have already claimed this reward!', { show_alert: true });
    }

    // Check channel membership via Telegram API
    let member;
    try {
      member = await ctx.telegram.getChatMember(task.channel_id, userId);
    } catch (apiErr) {
      console.error(`Telegram API check error for task ${taskId}:`, apiErr.message);

      if (apiErr.message.includes('chat not found') || apiErr.message.includes('bot is not a member')) {
        return ctx.answerCbQuery(
          'System Alert: The bot is not an admin in this channel. Please notify support.',
          { show_alert: true }
        );
      } else if (apiErr.message.includes('USER_NOT_PARTICIPANT')) {
        return ctx.answerCbQuery(
          'Verification Failed: You have not joined the channel yet. Please join first and then tap Verify.',
          { show_alert: true }
        );
      } else {
        return ctx.answerCbQuery(`Verification error: ${apiErr.message}`, { show_alert: true });
      }
    }

    const validStatuses = ['creator', 'administrator', 'member', 'restricted'];
    const isJoined = member && validStatuses.includes(member.status);

    if (!isJoined) {
      return ctx.answerCbQuery(
        'Verification Failed: You have not joined the channel yet. Please join first and then tap Verify.',
        { show_alert: true }
      );
    }

    // Success! Complete task and credit balance
    const result = await db.completeTask(userId, taskId);
    const newBalance = parseFloat(result.updatedUser.balance).toFixed(2);
    const rewardFormatted = parseFloat(result.reward).toFixed(2);

    await ctx.answerCbQuery(
      `Verified! +${rewardFormatted} ${config.currency} credited to your wallet!`,
      { show_alert: true }
    );

    const successMsg =
      `<b>Verification Successful!</b>\n\n` +
      `You joined: <b>${task.title}</b>\n` +
      `Credited: <b>+${rewardFormatted} ${config.currency}</b>\n` +
      `Current Balance: <b>${newBalance} ${config.currency}</b>\n\n` +
      `Complete more tasks below to keep earning:`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('View Next Tasks', 'tasks_list')],
      [Markup.button.callback('My Wallet', 'my_wallet')]
    ]);

    await ctx.editMessageText(successMsg, { parse_mode: 'HTML', ...keyboard });
  } catch (err) {
    console.error('Error in handleVerifyTask:', err);
    if (err.message === 'Task already completed') {
      return ctx.answerCbQuery('You have already completed this task!', { show_alert: true });
    }
    return ctx.answerCbQuery('Verification error. Please try again.', { show_alert: true });
  }
}

module.exports = {
  handleShowTasks,
  handleViewTaskDetails,
  handleVerifyTask
};
