const db = require('../database/db');
const config = require('../config');

/**
 * Verifier Engine for 2-Day (48-Hour) Channel Membership Holding Tasks
 */

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Checks a single holding task and approves or revokes it based on channel membership and time elapsed.
 */
async function checkHoldingTask(bot, task) {
  if (!bot || !task) return null;

  const now = Date.now();
  const unlockTime = task.unlock_at ? new Date(task.unlock_at).getTime() : 0;
  const isTimeElapsed = unlockTime > 0 && now >= unlockTime;
  const channelTarget = task.target_channel_id || task.channel_id;

  if (!channelTarget) {
    // If no channel ID was recorded, approve when 48h elapses
    if (isTimeElapsed) {
      await db.approvePendingTask(task.id, task.user_id, task.reward);
      try {
        await bot.telegram.sendMessage(
          task.user_id,
          `🎉 <b>Pending Reward Unlocked!</b>\n\n` +
          `Task: <b>${task.task_title || 'Channel Task'}</b>\n` +
          `Amount: <b>+${parseFloat(task.reward).toFixed(2)} ${config.currency}</b>\n\n` +
          `The 2-day holding period has completed. The reward has been credited to your <b>Available Balance</b>!`,
          { parse_mode: 'HTML' }
        );
      } catch (e) {}
      return { status: 'approved', task };
    }
    return { status: 'still_holding', task };
  }

  let member = null;
  let userLeft = false;
  let channelInaccessible = false;

  try {
    member = await bot.telegram.getChatMember(channelTarget, task.user_id);
    const validStatuses = ['creator', 'administrator', 'member', 'restricted'];
    if (!member || !validStatuses.includes(member.status)) {
      userLeft = true;
    }
  } catch (err) {
    const msg = (err.message || '').toLowerCase();
    if (msg.includes('user_not_participant')) {
      userLeft = true;
    } else if (
      msg.includes('chat not found') ||
      msg.includes('bot is not a member') ||
      msg.includes('bot was kicked') ||
      msg.includes('channel_private') ||
      msg.includes('chat_admin_required')
    ) {
      // Channel was removed or bot is no longer admin in channel
      // Do NOT penalize the user if the channel owner deleted the channel/bot!
      channelInaccessible = true;
    } else {
      console.warn(`[HoldingVerifier] Temporary check warning for user ${task.user_id} in ${channelTarget}:`, err.message);
      return { status: 'error', error: err.message };
    }
  }

  // CASE 1: User explicitly left before 2 days (or channel is accessible and user is not member)
  if (userLeft && !channelInaccessible) {
    console.log(`[HoldingVerifier] User ${task.user_id} left channel ${channelTarget} early. Revoking task #${task.id}`);
    await db.revokePendingTask(task.id, task.user_id, task.reward);
    try {
      await bot.telegram.sendMessage(
        task.user_id,
        `⚠️ <b>Task Reward Cancelled!</b>\n\n` +
        `You left the channel <b>${task.task_title || 'Channel'}</b> before the 2-day (48 hours) holding period finished.\n\n` +
        `❌ The pending reward of <b>${parseFloat(task.reward).toFixed(2)} ${config.currency}</b> has been revoked.\n\n` +
        `<i>Tip: Keep joined for at least 48 hours next time to keep your earnings.</i>`,
        { parse_mode: 'HTML' }
      );
    } catch (notifyErr) {
      console.warn(`[HoldingVerifier] Could not notify user ${task.user_id} of revocation:`, notifyErr.message);
    }
    return { status: 'revoked', task };
  }

  // CASE 2: User is still joined (or channel became inaccessible by admin), and 2 days elapsed!
  if (isTimeElapsed) {
    console.log(`[HoldingVerifier] 2-day holding completed for task #${task.id} (User ${task.user_id}). Unlocking payout!`);
    await db.approvePendingTask(task.id, task.user_id, task.reward);
    try {
      await bot.telegram.sendMessage(
        task.user_id,
        `🎉 <b>Reward Unlocked!</b>\n\n` +
        `Task: <b>${task.task_title || 'Channel Task'}</b>\n` +
        `You stayed joined for the required 2 days (48 hours)!\n\n` +
        `💰 <b>+${parseFloat(task.reward).toFixed(2)} ${config.currency}</b> has been transferred from Pending to your <b>Available Balance</b>.`,
        { parse_mode: 'HTML' }
      );
    } catch (notifyErr) {
      console.warn(`[HoldingVerifier] Could not notify user ${task.user_id} of unlock:`, notifyErr.message);
    }
    return { status: 'approved', task };
  }

  // CASE 3: Still actively holding within the 48-hour window
  return { status: 'still_holding', task };
}

/**
 * Checks all pending holding tasks across all users.
 */
async function checkAllHoldingTasks(bot) {
  if (!bot) return;
  try {
    const tasks = await db.getPendingHoldingTasks();
    if (!tasks || tasks.length === 0) return;

    let approved = 0;
    let revoked = 0;
    let holding = 0;

    for (const t of tasks) {
      try {
        const res = await checkHoldingTask(bot, t);
        if (res?.status === 'approved') approved++;
        else if (res?.status === 'revoked') revoked++;
        else if (res?.status === 'still_holding') holding++;
      } catch (err) {
        console.error(`[HoldingVerifier] Error checking task #${t.id}:`, err);
      }
      // Stagger Telegram API calls by 150ms to be polite to Telegram rate limits
      await sleep(150);
    }

    if (approved > 0 || revoked > 0) {
      console.log(`[HoldingVerifier] Completed scan of ${tasks.length} tasks -> Approved: ${approved}, Revoked: ${revoked}, Remaining: ${holding}`);
    }
  } catch (err) {
    console.error('[HoldingVerifier] Error in checkAllHoldingTasks:', err);
  }
}

/**
 * Checks pending holding tasks for a specific user (runs fast upon user loading app).
 */
async function checkUserHoldingTasks(bot, userId) {
  if (!bot || !userId) return;
  try {
    const tasks = await db.getPendingHoldingTasks(userId);
    if (!tasks || tasks.length === 0) return;

    for (const t of tasks) {
      try {
        await checkHoldingTask(bot, t);
      } catch (err) {
        console.error(`[HoldingVerifier] Error checking user ${userId} task #${t.id}:`, err);
      }
      await sleep(100);
    }
  } catch (err) {
    console.error(`[HoldingVerifier] Error checking tasks for user ${userId}:`, err);
  }
}

/**
 * Schedules background recurring check (e.g. every 10 minutes)
 */
function startHoldingVerificationScheduler(bot, intervalMinutes = 10) {
  if (!bot) return null;
  console.log(`⏱️ 2-Day Holding Verification Scheduler active (interval: ${intervalMinutes}m)`);
  
  // Initial check after 30 seconds of server startup
  setTimeout(() => {
    checkAllHoldingTasks(bot).catch(e => console.error('[HoldingVerifier] Initial scan error:', e));
  }, 30000);

  // Interval check
  const timer = setInterval(() => {
    checkAllHoldingTasks(bot).catch(e => console.error('[HoldingVerifier] Scheduled scan error:', e));
  }, intervalMinutes * 60 * 1000);

  return timer;
}

module.exports = {
  checkHoldingTask,
  checkAllHoldingTasks,
  checkUserHoldingTasks,
  startHoldingVerificationScheduler
};
