const express = require('express');
const router = express.Router();
const db = require('../database/db');
const config = require('../config');

// Helper to get telegraf bot instance from app
function getBot(req) {
  return req.app.get('telegramBot');
}

// 1. Get or Create User
router.get('/user', async (req, res) => {
  try {
    const { id, username, first_name, last_name, referrer } = req.query;
    if (!id) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const { user, isNew, referrerId } = await db.getOrCreateUser(
      { id, username, first_name, last_name },
      referrer
    );

    // Reward referrer if new user
    if (isNew && referrerId && config.referralReward > 0) {
      try {
        await db.addBalance(referrerId, config.referralReward, true);
        const bot = getBot(req);
        if (bot) {
          await bot.telegram.sendMessage(
            referrerId,
            `New Referral Reward!\n\n` +
            `User: ${first_name || 'New Member'} joined using your referral link.\n` +
            `You earned: +${config.referralReward.toFixed(2)} ${config.currency}`,
            { parse_mode: 'HTML' }
          );
        }
      } catch (e) {
        console.error('Referral notify error:', e.message);
      }
    }

    const completed = await db.getUserCompletedTasks(id);
    const withdrawals = await db.getUserWithdrawals(id);
    const wallets = await db.getUserWallets(id);
    const isAdmin = config.isAdmin({ id, username });

    res.json({
      user,
      wallets,
      completedCount: completed.length,
      recentTasks: completed.slice(0, 5),
      recentWithdrawals: withdrawals.slice(0, 5),
      isAdmin,
      currency: config.currency,
      minWithdraw: config.minWithdraw,
      referralReward: config.referralReward,
      usdtRate: config.usdtRate,
      minWithdrawUsdt: config.minWithdrawUsdt
    });
  } catch (err) {
    console.error('API /user error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2. Get Available Tasks for User
router.get('/tasks', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const tasks = await db.getActiveTasksForUser(userId);
    res.json({ tasks });
  } catch (err) {
    console.error('API /tasks error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3. Verify Channel Task
router.post('/verify-task', async (req, res) => {
  try {
    const { taskId, userId } = req.body;
    if (!taskId || !userId) {
      return res.status(400).json({ error: 'taskId and userId required' });
    }

    const task = await db.getTask(taskId);
    if (!task) return res.status(404).json({ error: 'Task not found!' });

    const alreadyCompleted = await db.isTaskCompletedByUser(userId, taskId);
    if (alreadyCompleted) {
      return res.status(400).json({ error: 'You have already completed this task!' });
    }

    const bot = getBot(req);
    if (!bot) {
      return res.status(500).json({ error: 'Bot server is not running!' });
    }

    let member;
    try {
      member = await bot.telegram.getChatMember(task.channel_id, userId);
    } catch (apiErr) {
      console.error(`API verify check error for task ${taskId}:`, apiErr.message);
      if (apiErr.message.includes('chat not found') || apiErr.message.includes('bot is not a member')) {
        return res.status(400).json({
          error: 'Bot is not an administrator in this channel. Please notify support.'
        });
      } else if (apiErr.message.includes('USER_NOT_PARTICIPANT')) {
        return res.status(400).json({
          error: 'You have not joined this channel yet! Please join first, then tap Verify.'
        });
      } else {
        return res.status(400).json({ error: `Verification failed: ${apiErr.message}` });
      }
    }

    const validStatuses = ['creator', 'administrator', 'member', 'restricted'];
    if (!member || !validStatuses.includes(member.status)) {
      return res.status(400).json({
        error: 'You have not joined this channel yet! Please join first, then tap Verify.'
      });
    }

    // Complete task
    const result = await db.completeTask(userId, taskId);
    res.json({
      success: true,
      message: `Task verified! +${parseFloat(result.reward).toFixed(2)} ${config.currency} added to your wallet.`,
      reward: result.reward,
      user: result.updatedUser
    });
  } catch (err) {
    console.error('API /verify-task error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 4. Save or Update User Saved Wallets (BDT Accounts & Binance ID)
router.post('/wallet/save', async (req, res) => {
  try {
    const { userId, bdt_account_1_type, bdt_account_1_number, bdt_account_2_type, bdt_account_2_number, binance_id } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const phoneRegex = /^01[3-9]\d{8}$/;
    if (bdt_account_1_number && !phoneRegex.test(bdt_account_1_number.trim())) {
      return res.status(400).json({ error: 'Account 1 must be a valid 11-digit Bangladeshi mobile number (01xxxxxxxxx)' });
    }
    if (bdt_account_2_number && !phoneRegex.test(bdt_account_2_number.trim())) {
      return res.status(400).json({ error: 'Account 2 must be a valid 11-digit Bangladeshi mobile number (01xxxxxxxxx)' });
    }

    const updatedUser = await db.updateUserWallets(userId, {
      bdt_account_1_type: bdt_account_1_type || 'bKash',
      bdt_account_1_number: bdt_account_1_number ? bdt_account_1_number.trim() : '',
      bdt_account_2_type: bdt_account_2_type || 'Nagad',
      bdt_account_2_number: bdt_account_2_number ? bdt_account_2_number.trim() : '',
      binance_id: binance_id ? binance_id.trim() : ''
    });

    res.json({
      success: true,
      message: 'Wallet settings saved successfully!',
      user: updatedUser
    });
  } catch (err) {
    console.error('API /wallet/save error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 4a. Add New Wallet Account (bKash / Nagad / Rocket / Binance)
router.post('/wallet/add', async (req, res) => {
  try {
    const { userId, walletType, provider, accountNumber } = req.body;
    if (!userId || !walletType || !provider || !accountNumber) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    const type = walletType.toUpperCase();
    let normProvider = String(provider).trim();
    const cleanNum = String(accountNumber).trim();

    if (type === 'BDT') {
      const allowed = ['bKash', 'Nagad'];
      const match = allowed.find(p => p.toLowerCase() === normProvider.toLowerCase());
      if (!match) {
        return res.status(400).json({ error: 'Please select bKash or Nagad.' });
      }
      normProvider = match;

      const phoneRegex = /^01[3-9]\d{8}$/;
      if (!phoneRegex.test(cleanNum)) {
        return res.status(400).json({ error: 'Please enter a valid 11-digit number starting with 01 (e.g. 01XXXXXXXXX).' });
      }
    } else if (type === 'USDT') {
      normProvider = 'Binance Pay';
      if (cleanNum.length < 5) {
        return res.status(400).json({ error: 'Please enter a valid Binance Pay ID or UID (at least 5 characters).' });
      }
    } else {
      return res.status(400).json({ error: 'Invalid wallet type.' });
    }

    const existing = await db.getUserWallets(userId, type);
    if (existing && existing.length >= 2) {
      return res.status(400).json({ error: 'You can add a maximum of 2 accounts.' });
    }

    const newWallet = await db.addUserWallet(userId, {
      wallet_type: type,
      provider: normProvider,
      account_number: cleanNum
    });

    const allWallets = await db.getUserWallets(userId);

    res.json({
      success: true,
      message: `${normProvider} account added successfully!`,
      wallet: newWallet,
      wallets: allWallets
    });
  } catch (err) {
    console.error('API /wallet/add error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 4b. Get All Saved Wallets for User
router.get('/wallet/list', async (req, res) => {
  try {
    const { userId, walletType } = req.query;
    if (!userId) return res.status(400).json({ error: 'User ID is required' });
    const wallets = await db.getUserWallets(userId, walletType);
    res.json({ success: true, wallets });
  } catch (err) {
    console.error('API /wallet/list error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 4c. Delete a Saved Wallet Account
router.post('/wallet/delete', async (req, res) => {
  try {
    const { userId, walletId } = req.body;
    if (!userId || !walletId) {
      return res.status(400).json({ error: 'User ID and Wallet ID are required' });
    }
    const success = await db.deleteUserWallet(walletId, userId);
    const wallets = await db.getUserWallets(userId);
    res.json({ success, message: 'Account removed successfully.', wallets });
  } catch (err) {
    console.error('API /wallet/delete error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 4d. Set Default Wallet
router.post('/wallet/select-default', async (req, res) => {
  try {
    const { userId, walletId } = req.body;
    if (!userId || !walletId) {
      return res.status(400).json({ error: 'User ID and Wallet ID are required' });
    }
    const success = await db.setDefaultUserWallet(walletId, userId);
    const wallets = await db.getUserWallets(userId);
    res.json({ success, wallets });
  } catch (err) {
    console.error('API /wallet/select-default error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 5. Request Withdrawal (Supports BDT and USDT via Binance ID)
router.post('/withdraw', async (req, res) => {
  try {
    const { userId, method, accountNumber, amount, walletType } = req.body;
    if (!userId || !method || !accountNumber || !amount) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const isUsdt = walletType === 'USDT' || method === 'USDT' || method.includes('USDT') || method.includes('Binance');
    let bdtDeductAmount = 0;
    let displayMethod = method;

    if (isUsdt) {
      // USDT Withdrawal via Binance ID
      const usdtAmt = parseFloat(amount);
      if (isNaN(usdtAmt) || usdtAmt < config.minWithdrawUsdt) {
        return res.status(400).json({
          error: `Minimum withdrawal for USDT is $${config.minWithdrawUsdt.toFixed(2)} (1 USD)`
        });
      }

      if (!accountNumber.trim()) {
        return res.status(400).json({ error: 'Please provide a valid Binance ID or Pay ID' });
      }

      bdtDeductAmount = usdtAmt * config.usdtRate;
      displayMethod = `USDT ($${usdtAmt.toFixed(2)} via Binance ID)`;
    } else {
      // BDT Withdrawal via bKash / Nagad / Rocket
      const bdtAmt = parseFloat(amount);
      if (isNaN(bdtAmt) || bdtAmt < config.minWithdraw) {
        return res.status(400).json({
          error: `Minimum withdrawal amount is ${config.minWithdraw} ${config.currency}`
        });
      }

      const phoneRegex = /^01[3-9]\d{8}$/;
      if (!phoneRegex.test(accountNumber.trim())) {
        return res.status(400).json({ error: 'Please enter a valid 11-digit mobile number' });
      }

      bdtDeductAmount = bdtAmt;
      displayMethod = method;
    }

    const user = await db.getUser(userId);
    if (!user || parseFloat(user.balance) < bdtDeductAmount) {
      return res.status(400).json({ error: 'Insufficient balance to complete this cashout request!' });
    }

    const withdrawal = await db.createWithdrawal({
      userId,
      amount: bdtDeductAmount,
      method: displayMethod,
      accountNumber: accountNumber.trim()
    });

    const updatedUser = await db.getUser(userId);

    // Notify Admins without emojis
    const bot = getBot(req);
    if (bot) {
      for (const adminId of config.adminIds) {
        try {
          await bot.telegram.sendMessage(
            adminId,
            `New Cashout Request (#${withdrawal.id})\n\n` +
            `User: ${user.first_name || 'Member'} (@${user.username || 'N/A'})\n` +
            `ID: ${userId}\n` +
            `Method: ${displayMethod}\n` +
            `Account: ${accountNumber.trim()}\n` +
            `Amount: ${bdtDeductAmount.toFixed(2)} ${config.currency}`,
            { parse_mode: 'HTML' }
          );
        } catch (e) {}
      }
    }

    res.json({
      success: true,
      message: 'Withdrawal request submitted successfully!',
      withdrawal,
      user: updatedUser
    });
  } catch (err) {
    console.error('API /withdraw error:', err);
    res.status(400).json({ error: err.message });
  }
});

// 5. Withdrawal History
router.get('/withdrawals', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const history = await db.getUserWithdrawals(userId);
    res.json({ history });
  } catch (err) {
    console.error('API /withdrawals error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ================= ADMIN APIS =================

// Check Admin middleware helper
function checkAdminAccess(req, res) {
  const adminId = req.query.adminId || req.body.adminId;
  const username = req.query.adminUsername || req.body.adminUsername;
  if (!config.isAdmin({ id: adminId, username })) {
    res.status(403).json({ error: 'Access Denied: Admin only' });
    return false;
  }
  return true;
}

// 6. Admin Stats
router.get('/admin/stats', async (req, res) => {
  if (!checkAdminAccess(req, res)) return;
  try {
    const stats = await db.getStats();
    res.json({ stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Admin Tasks List
router.get('/admin/tasks', async (req, res) => {
  if (!checkAdminAccess(req, res)) return;
  try {
    const tasks = await db.getAllTasks();
    res.json({ tasks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Admin Add Task
router.post('/admin/tasks', async (req, res) => {
  if (!checkAdminAccess(req, res)) return;
  try {
    const { title, channel_id, channel_link, reward, max_users, description } = req.body;
    if (!title || !channel_id || !channel_link || !reward) {
      return res.status(400).json({ error: 'Title, Channel ID, Link, and Reward are required' });
    }

    const task = await db.addTask({
      title,
      description,
      channel_id,
      channel_link,
      reward,
      max_users: parseInt(max_users || 0, 10)
    });

    res.json({ success: true, task });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9. Admin Toggle / Delete Task
router.post('/admin/tasks/toggle', async (req, res) => {
  if (!checkAdminAccess(req, res)) return;
  try {
    const { taskId } = req.body;
    const task = await db.toggleTaskStatus(taskId);
    res.json({ success: true, task });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/tasks/delete', async (req, res) => {
  if (!checkAdminAccess(req, res)) return;
  try {
    const { taskId } = req.body;
    await db.deleteTask(taskId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 10. Admin Pending Withdrawals
router.get('/admin/withdrawals', async (req, res) => {
  if (!checkAdminAccess(req, res)) return;
  try {
    const pending = await db.getPendingWithdrawals();
    res.json({ pending });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 11. Admin Approve / Reject Withdrawal
router.post('/admin/withdrawals/action', async (req, res) => {
  if (!checkAdminAccess(req, res)) return;
  try {
    const { withdrawalId, action, note } = req.body;
    const w = await db.getWithdrawal(withdrawalId);
    if (!w || w.status !== 'pending') {
      return res.status(400).json({ error: 'Request not found or already processed' });
    }

    const bot = getBot(req);

    if (action === 'approve') {
      await db.approveWithdrawal(withdrawalId, note || 'Approved via Mini App');
      if (bot) {
        try {
          await bot.telegram.sendMessage(
            w.user_id,
            `🎉 <b>Payment Disbursed Successfully!</b>\n\n` +
            `🆔 <b>Withdrawal ID:</b> #${w.id}\n` +
            `💵 <b>Amount:</b> ${parseFloat(w.amount).toFixed(2)} ${config.currency}\n` +
            `📱 <b>Method:</b> ${w.method} (${w.account_number})\n\n` +
            `Your payout has been transferred to your account. Thank you! 🚀`,
            { parse_mode: 'HTML' }
          );
        } catch (e) {}
      }
    } else {
      await db.rejectWithdrawal(withdrawalId, note || 'Rejected via Mini App');
      if (bot) {
        try {
          await bot.telegram.sendMessage(
            w.user_id,
            `⚠️ <b>Withdrawal Request Rejected</b>\n\n` +
            `🆔 <b>Withdrawal ID:</b> #${w.id}\n` +
            `💵 <b>Amount:</b> ${parseFloat(w.amount).toFixed(2)} ${config.currency}\n\n` +
            `The funds have been refunded to your wallet balance.`,
            { parse_mode: 'HTML' }
          );
        } catch (e) {}
      }
    }

    res.json({ success: true, action });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
