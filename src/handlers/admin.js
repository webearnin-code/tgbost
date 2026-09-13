const { Markup } = require('telegraf');
const db = require('../database/db');
const config = require('../config');

// In-memory state for admin actions (Add task, broadcast, etc.)
const adminStates = new Map();

async function handleAdminPanel(ctx) {
  try {
    const user = ctx.from;
    if (!config.isAdmin(user)) {
      return ctx.reply('Access Denied. This section is restricted to authorized administrators only.');
    }

    const stats = await db.getStats();

    const msg =
      `<b>Administrator Control Panel:</b>\n\n` +
      `System Overview:\n` +
      `- Total Users: <b>${stats.totalUsers}</b>\n` +
      `- Active Tasks: <b>${stats.totalTasks}</b>\n` +
      `- Tasks Completed: <b>${stats.totalCompletedTasks}</b>\n` +
      `- Total Paid Out: <b>${stats.totalPaid.toFixed(2)} ${config.currency}</b>\n` +
      `- Pending Cashouts: <b>${stats.pendingWithdrawals}</b>\n\n` +
      `Select an administrative option below:`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('Add Group / Channel Task', 'admin_add_task_channel'),
        Markup.button.callback('Add Bot Task', 'admin_add_task_bot')
      ],
      [
        Markup.button.callback('Manage Tasks', 'admin_manage_tasks'),
        Markup.button.callback(`Pending Cashouts (${stats.pendingWithdrawals})`, 'admin_pending_withdrawals')
      ],
      [
        Markup.button.callback('Broadcast Announcement', 'admin_broadcast'),
        Markup.button.callback('Refresh Statistics', 'admin_stats')
      ]
    ]);

    if (ctx.callbackQuery) {
      await ctx.editMessageText(msg, { parse_mode: 'HTML', ...keyboard });
    } else {
      await ctx.reply(msg, { parse_mode: 'HTML', ...keyboard });
    }
  } catch (err) {
    console.error('Error in handleAdminPanel:', err);
    await ctx.reply('Failed to load admin dashboard.');
  }
}

// ---------------- ADD TASK WIZARD ----------------

async function handleAdminAddTaskStart(ctx, type = 'channel') {
  const adminUser = ctx.from;
  if (!config.isAdmin(adminUser)) return;

  adminStates.set(adminUser.id, {
    action: 'ADD_TASK',
    step: 'TITLE',
    data: { task_type: type }
  });

  const msg =
    `<b>Create New ${type === 'bot' ? 'Telegram Bot' : 'Group/Channel'} Task:</b>\n\n` +
    `Step 1/4: <b>Enter a descriptive task title</b>\n` +
    `<i>(e.g., ${type === 'bot' ? 'Join Airdrop Bot' : 'Official Announcement Channel'})</i>\n\n` +
    `Type /cancel to abort.`;

  const kb = Markup.inlineKeyboard([[Markup.button.callback('Cancel', 'admin_panel')]]);

  if (ctx.callbackQuery) {
    await ctx.editMessageText(msg, { parse_mode: 'HTML', ...kb });
  } else {
    await ctx.reply(msg, { parse_mode: 'HTML', ...kb });
  }
}

// ---------------- MANAGE TASKS ----------------

async function handleAdminManageTasks(ctx) {
  const adminUser = ctx.from;
  if (!config.isAdmin(adminUser)) return;

  const tasks = await db.getAllTasks();

  if (!tasks || tasks.length === 0) {
    const msg = `<b>No tasks found!</b>\n\nTap below to publish your first task.`;
    return ctx.editMessageText(msg, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('Add Group / Channel Task', 'admin_add_task_channel'),
          Markup.button.callback('Add Bot Task', 'admin_add_task_bot')
        ],
        [Markup.button.callback('Back to Dashboard', 'admin_panel')]
      ])
    });
  }

  let msg = `<b>Manage Tasks (${tasks.length}):</b>\n\nSelect a task below to toggle status or delete:\n`;

  const buttons = tasks.map(t => {
    const statusText = t.is_active === 1 ? 'Active' : 'Paused';
    const limitText = t.max_users > 0 ? `${t.completed_count}/${t.max_users}` : `${t.completed_count}/Unlimited`;
    return [
      Markup.button.callback(
        `#${t.id} ${t.title} [${parseFloat(t.reward).toFixed(2)}${config.currency}] (${statusText})`,
        `admin_task_detail_${t.id}`
      )
    ];
  });

  buttons.push([
    Markup.button.callback('Add New Task', 'admin_add_task'),
    Markup.button.callback('Admin Dashboard', 'admin_panel')
  ]);

  await ctx.editMessageText(msg, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard(buttons)
  });
}

async function handleAdminTaskDetail(ctx, taskId) {
  const adminUser = ctx.from;
  if (!config.isAdmin(adminUser)) return;

  const task = await db.getTask(taskId);
  if (!task) {
    return ctx.answerCbQuery('Task not found!');
  }

  const statusText = task.is_active === 1 ? 'Active' : 'Paused';
  const limitText = task.max_users > 0 ? `${task.completed_count} / ${task.max_users} members` : `${task.completed_count} members (Unlimited)`;

  const msg =
    `<b>Task Details (#${task.id}):</b>\n\n` +
    `Title: ${task.title}\n` +
    `Channel ID: <code>${task.channel_id}</code>\n` +
    `Join Link: ${task.channel_link}\n` +
    `Reward: ${parseFloat(task.reward).toFixed(2)} ${config.currency}\n` +
    `Completions: ${limitText}\n` +
    `Status: ${statusText}\n` +
    `Created: ${new Date(task.created_at).toLocaleString()}`;

  const toggleBtnText = task.is_active === 1 ? 'Pause Task' : 'Resume Task';

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback(toggleBtnText, `admin_task_toggle_${task.id}`)],
    [Markup.button.callback('Delete Task', `admin_task_delete_${task.id}`)],
    [Markup.button.callback('Back to Task List', 'admin_manage_tasks')]
  ]);

  await ctx.editMessageText(msg, { parse_mode: 'HTML', ...keyboard });
}

async function handleAdminToggleTask(ctx, taskId) {
  const adminUser = ctx.from;
  if (!config.isAdmin(adminUser)) return;

  const updated = await db.toggleTaskStatus(taskId);
  await ctx.answerCbQuery(updated.is_active === 1 ? 'Task resumed' : 'Task paused');
  await handleAdminTaskDetail(ctx, taskId);
}

async function handleAdminDeleteTask(ctx, taskId) {
  const adminUser = ctx.from;
  if (!config.isAdmin(adminUser)) return;

  await db.deleteTask(taskId);
  await ctx.answerCbQuery('Task deleted successfully');
  await handleAdminManageTasks(ctx);
}

// ---------------- PENDING WITHDRAWALS ----------------

async function handleAdminPendingWithdrawals(ctx) {
  const adminUser = ctx.from;
  if (!config.isAdmin(adminUser)) return;

  const pending = await db.getPendingWithdrawals();

  if (!pending || pending.length === 0) {
    const msg = `<b>No pending cashout requests.</b>\n\nAll requests have been processed.`;
    return ctx.editMessageText(msg, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('Admin Dashboard', 'admin_panel')]
      ])
    });
  }

  let msg = `<b>Pending Cashouts (${pending.length}):</b>\n\n`;

  for (const w of pending.slice(0, 5)) {
    msg += `Request #${w.id}\n`;
    msg += `User: ${w.first_name || 'Member'} (@${w.username || 'N/A'}, ID: <code>${w.user_id}</code>)\n`;
    msg += `Method: <b>${w.method}</b> (${w.account_number})\n`;
    msg += `Amount: <b>${parseFloat(w.amount).toFixed(2)} ${config.currency}</b>\n`;
    msg += `Time: ${new Date(w.created_at).toLocaleString()}\n\n`;
  }

  const buttons = [];
  for (const w of pending.slice(0, 5)) {
    buttons.push([
      Markup.button.callback(`Approve #${w.id} (${w.amount} BDT)`, `admin_approve_${w.id}`),
      Markup.button.callback(`Reject #${w.id}`, `admin_reject_${w.id}`)
    ]);
  }

  buttons.push([Markup.button.callback('Admin Dashboard', 'admin_panel')]);

  await ctx.editMessageText(msg, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard(buttons)
  });
}

async function handleAdminApproveWithdrawal(ctx, withdrawalId) {
  const adminUser = ctx.from;
  if (!config.isAdmin(adminUser)) return;

  try {
    const w = await db.getWithdrawal(withdrawalId);
    if (!w || w.status !== 'pending') {
      return ctx.answerCbQuery('This request has already been processed.');
    }

    await db.approveWithdrawal(withdrawalId, 'Admin Approved');
    await ctx.answerCbQuery(`Request #${withdrawalId} approved`, { show_alert: true });

    // Notify user without emojis
    try {
      await ctx.telegram.sendMessage(
        w.user_id,
        `<b>Payment Disbursed Successfully</b>\n\n` +
        `Withdrawal ID: #${w.id}\n` +
        `Amount: ${parseFloat(w.amount).toFixed(2)} ${config.currency}\n` +
        `Method: ${w.method} (${w.account_number})\n\n` +
        `Your withdrawal request has been approved and funds have been transferred.`,
        { parse_mode: 'HTML' }
      );
    } catch (notifyErr) {
      console.error('Error notifying user about approved withdrawal:', notifyErr.message);
    }

    await handleAdminPendingWithdrawals(ctx);
  } catch (err) {
    console.error('Error in handleAdminApproveWithdrawal:', err);
    await ctx.answerCbQuery(`Error: ${err.message}`);
  }
}

async function handleAdminRejectWithdrawal(ctx, withdrawalId) {
  const adminUser = ctx.from;
  if (!config.isAdmin(adminUser)) return;

  try {
    const w = await db.getWithdrawal(withdrawalId);
    if (!w || w.status !== 'pending') {
      return ctx.answerCbQuery('This request has already been processed.');
    }

    await db.rejectWithdrawal(withdrawalId, 'Admin Rejected & Refunded');
    await ctx.answerCbQuery(`Request #${withdrawalId} rejected and refunded.`, { show_alert: true });

    // Notify user without emojis
    try {
      await ctx.telegram.sendMessage(
        w.user_id,
        `<b>Withdrawal Request Rejected</b>\n\n` +
        `Withdrawal ID: #${w.id}\n` +
        `Amount: ${parseFloat(w.amount).toFixed(2)} ${config.currency}\n` +
        `Method: ${w.method} (${w.account_number})\n\n` +
        `Your deducted funds have been refunded to your wallet balance. Please verify your account details and submit again.`,
        { parse_mode: 'HTML' }
      );
    } catch (notifyErr) {
      console.error('Error notifying user about rejected withdrawal:', notifyErr.message);
    }

    await handleAdminPendingWithdrawals(ctx);
  } catch (err) {
    console.error('Error in handleAdminRejectWithdrawal:', err);
    await ctx.answerCbQuery(`Error: ${err.message}`);
  }
}

// ---------------- BROADCAST ----------------

async function handleAdminBroadcastStart(ctx) {
  const adminUser = ctx.from;
  if (!config.isAdmin(adminUser)) return;

  adminStates.set(adminUser.id, {
    action: 'BROADCAST',
    step: 'MESSAGE'
  });

  const msg =
    `<b>Broadcast Message:</b>\n\n` +
    `Send the message or photo you want to broadcast to all registered bot members.\n\n` +
    `Type /cancel to abort.`;

  const kb = Markup.inlineKeyboard([[Markup.button.callback('Cancel', 'admin_panel')]]);

  if (ctx.callbackQuery) {
    await ctx.editMessageText(msg, { parse_mode: 'HTML', ...kb });
  } else {
    await ctx.reply(msg, { parse_mode: 'HTML', ...kb });
  }
}

// ---------------- ADMIN TEXT INPUT PROCESSING ----------------

async function handleAdminText(ctx) {
  const adminUser = ctx.from;
  if (!config.isAdmin(adminUser)) return false;

  const state = adminStates.get(adminUser.id);
  if (!state) return false;

  const text = ctx.message && ctx.message.text ? ctx.message.text.trim() : '';

  if (text.toLowerCase() === '/cancel' || text.toLowerCase() === 'cancel') {
    adminStates.delete(adminUser.id);
    await ctx.reply('Admin action cancelled.');
    await handleAdminPanel(ctx);
    return true;
  }

  // --- ADD TASK FLOW ---
  if (state.action === 'ADD_TASK') {
    if (state.step === 'TITLE') {
      if (!text) {
        await ctx.reply('Please enter a valid task title:');
        return true;
      }
      state.data.title = text;
      state.step = 'CHANNEL_LINK';
      adminStates.set(adminUser.id, state);

      await ctx.reply(
        `Task Title: <b>${text}</b>\n\n` +
        `Step 2/4: <b>Enter Join Link:</b>\n` +
        `<i>(e.g., https://t.me/my_channel or https://t.me/AirdropBot?start=123)</i>\n\n` +
        (state.data.task_type === 'channel' ? `Note: Make sure your bot is added as an <b>Administrator</b> in this channel/group.` : `Note: Please provide the exact referral or start link for the bot.`),
        { parse_mode: 'HTML' }
      );
      return true;
    }

    if (state.step === 'CHANNEL_LINK') {
      if (!text.startsWith('http://') && !text.startsWith('https://') && !text.startsWith('t.me/')) {
        await ctx.reply('Please enter a valid Telegram link (e.g. https://t.me/your_channel):');
        return true;
      }

      let link = text;
      if (link.startsWith('t.me/')) link = 'https://' + link;

      // Automatically extract the username/channel_id from the link
      let extractedId = '';
      const match = link.match(/t\.me\/(?:\+)?([a-zA-Z0-9_]+)/i);
      
      if (state.data.task_type === 'bot') {
        if (match) {
          extractedId = match[1];
        } else {
          extractedId = 'bot'; // fallback
        }
        // Ensure it ends with bot (as required by Telegram) but we append it anyway if it doesn't to mark it as bot task
        if (!extractedId.toLowerCase().endsWith('bot')) extractedId += 'bot';
        extractedId = '@' + extractedId;
      } else {
        if (match && !link.includes('t.me/+')) {
          extractedId = '@' + match[1]; // public channel username
        } else {
          // It's a private invite link (e.g. t.me/+AbCd) or unable to parse.
          // Because user requested to remove the ID step, we will use a dummy ID.
          // Note: getChatMember will NOT work for this private channel without the real -100 ID.
          // For now, we store the link as the ID fallback.
          extractedId = link; 
        }
      }

      state.data.channel_id = extractedId;
      state.data.channel_link = link;
      state.step = 'REWARD';
      adminStates.set(adminUser.id, state);

      await ctx.reply(
        `Join Link Saved!\n\n` +
        `Step 3/4: <b>Enter Reward Amount per Member:</b>\n` +
        `<i>(e.g., 2.00 or 2.50)</i>`,
        { parse_mode: 'HTML' }
      );
      return true;
    }

    if (state.step === 'REWARD') {
      const rew = parseFloat(text);
      if (isNaN(rew) || rew <= 0) {
        await ctx.reply('Please enter a valid positive number (e.g., 2.50):');
        return true;
      }

      state.data.reward = rew;
      state.step = 'MAX_USERS';
      adminStates.set(adminUser.id, state);

      await ctx.reply(
        `Reward set: <b>${rew.toFixed(2)} ${config.currency}</b>\n\n` +
        `Step 4/4: <b>Enter Maximum Members Limit:</b>\n` +
        `<i>(Enter <code>0</code> for unlimited, or a specific limit like <code>100</code>):</i>`,
        { parse_mode: 'HTML' }
      );
      return true;
    }

    if (state.step === 'MAX_USERS') {
      const maxU = parseInt(text, 10);
      if (isNaN(maxU) || maxU < 0) {
        await ctx.reply('Please enter 0 or a positive integer:');
        return true;
      }

      state.data.max_users = maxU;
      const taskData = state.data;
      adminStates.delete(adminUser.id);

      const newTask = await db.addTask(taskData);

      const confirmMsg =
        `<b>Task Published Successfully!</b>\n\n` +
        `Task ID: #${newTask.id}\n` +
        `Title: ${newTask.title}\n` +
        `Channel: <code>${newTask.channel_id}</code>\n` +
        `Link: ${newTask.channel_link}\n` +
        `Reward: ${parseFloat(newTask.reward).toFixed(2)} ${config.currency}\n` +
        `Member Limit: ${newTask.max_users === 0 ? 'Unlimited' : `${newTask.max_users} members`}\n\n` +
        `This task is now live and available in the task feed.`;

      await ctx.reply(confirmMsg, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('Manage Tasks', 'admin_manage_tasks')],
          [
            Markup.button.callback('Add Group/Channel Task', 'admin_add_task_channel'),
            Markup.button.callback('Add Bot Task', 'admin_add_task_bot')
          ],
          [Markup.button.callback('Admin Dashboard', 'admin_panel')]
        ])
      });
      return true;
    }
  }

  // --- BROADCAST FLOW ---
  if (state.action === 'BROADCAST' && state.step === 'MESSAGE') {
    adminStates.delete(adminUser.id);

    const userIds = await db.getAllUserIds();
    await ctx.reply(`Starting broadcast to ${userIds.length} members...`);

    let successCount = 0;
    let failCount = 0;

    for (const uId of userIds) {
      try {
        await ctx.telegram.copyMessage(uId, ctx.chat.id, ctx.message.message_id);
        successCount++;
      } catch (sendErr) {
        failCount++;
      }
      await new Promise(r => setTimeout(r, 50));
    }

    await ctx.reply(
      `<b>Broadcast Completed</b>\n\n` +
      `Successfully Delivered: <b>${successCount}</b>\n` +
      `Failed: <b>${failCount}</b>`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('Admin Dashboard', 'admin_panel')]])
      }
    );
    return true;
  }

  return false;
}

module.exports = {
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
};
