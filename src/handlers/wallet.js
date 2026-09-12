const { Markup } = require('telegraf');
const db = require('../database/db');
const config = require('../config');

// In-memory state storage for withdrawal flow
const withdrawStates = new Map();

async function handleShowWallet(ctx) {
  try {
    const userId = ctx.from.id;
    const user = await db.getUser(userId);

    if (!user) {
      return ctx.reply('User profile not found. Please send /start to register.');
    }

    const completedTasks = await db.getUserCompletedTasks(userId);
    const balance = parseFloat(user.balance || 0).toFixed(2);
    const totalEarned = parseFloat(user.total_earned || 0).toFixed(2);
    const totalWithdrawn = parseFloat(user.total_withdrawn || 0).toFixed(2);
    const name = user.first_name || 'Member';
    const usdtEquivalent = (parseFloat(balance) / config.usdtRate).toFixed(2);

    let walletInfoText = '';
    if (user.bdt_account_1_number || user.bdt_account_2_number || user.binance_id) {
      walletInfoText = '\n<b>Saved Accounts:</b>\n';
      if (user.bdt_account_1_number) {
        walletInfoText += `- ${user.bdt_account_1_type || 'bKash'}: <code>${user.bdt_account_1_number}</code>\n`;
      }
      if (user.bdt_account_2_number) {
        walletInfoText += `- ${user.bdt_account_2_type || 'Nagad'}: <code>${user.bdt_account_2_number}</code>\n`;
      }
      if (user.binance_id) {
        walletInfoText += `- Binance ID: <code>${user.binance_id}</code>\n`;
      }
    }

    const msg =
      `<b>Wallet Overview:</b>\n\n` +
      `Name: ${name}\n` +
      `User ID: <code>${user.id}</code>\n` +
      (user.username ? `Username: @${user.username}\n` : '') +
      `\nAvailable Balance: <b>${balance} ${config.currency}</b> (~$${usdtEquivalent} USDT)\n` +
      `Total Earned: ${totalEarned} ${config.currency}\n` +
      `Total Withdrawn: ${totalWithdrawn} ${config.currency}\n` +
      `Completed Tasks: ${completedTasks.length}\n` +
      `Total Referrals: ${user.referral_count || 0}\n` +
      walletInfoText +
      `\nMinimum Payout:\n` +
      `- BDT Wallet (bKash/Nagad/Rocket): ${config.minWithdraw} ${config.currency}\n` +
      `- USDT Wallet (Binance ID): $${config.minWithdrawUsdt.toFixed(2)} USDT (Rate: 1 USDT = ${config.usdtRate} ${config.currency})`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('Withdraw Funds (Cashout)', 'start_withdraw')],
      [Markup.button.callback('Withdrawal History', 'withdraw_history')],
      [Markup.button.callback('Refresh Balance', 'refresh_wallet')]
    ]);

    if (ctx.callbackQuery) {
      await ctx.editMessageText(msg, { parse_mode: 'HTML', ...keyboard });
    } else {
      await ctx.reply(msg, { parse_mode: 'HTML', ...keyboard });
    }
  } catch (err) {
    console.error('Error in handleShowWallet:', err);
    await ctx.reply('Failed to load wallet.');
  }
}

async function handleStartWithdraw(ctx) {
  try {
    const userId = ctx.from.id;
    const user = await db.getUser(userId);

    if (!user) return;

    const balance = parseFloat(user.balance || 0);

    if (balance < config.minWithdraw) {
      const needed = (config.minWithdraw - balance).toFixed(2);
      const alertMsg =
        `<b>Insufficient Balance</b>\n\n` +
        `Your current balance: <b>${balance.toFixed(2)} ${config.currency}</b>\n` +
        `Minimum cashout limit: <b>${config.minWithdraw} ${config.currency}</b>\n\n` +
        `You need <b>${needed} ${config.currency}</b> more to withdraw. Complete more channel tasks or invite friends to increase your balance.`;

      const kb = Markup.inlineKeyboard([
        [Markup.button.callback('View Available Tasks', 'tasks_list')],
        [Markup.button.callback('Back to Wallet', 'my_wallet')]
      ]);

      if (ctx.callbackQuery) {
        return ctx.editMessageText(alertMsg, { parse_mode: 'HTML', ...kb });
      } else {
        return ctx.reply(alertMsg, { parse_mode: 'HTML', ...kb });
      }
    }

    const buttons = [];

    // Saved BDT Account 1
    if (user.bdt_account_1_number) {
      buttons.push([
        Markup.button.callback(
          `Saved: ${user.bdt_account_1_type || 'bKash'} (${user.bdt_account_1_number})`,
          `withdraw_saved_bdt1`
        )
      ]);
    }

    // Saved BDT Account 2
    if (user.bdt_account_2_number) {
      buttons.push([
        Markup.button.callback(
          `Saved: ${user.bdt_account_2_type || 'Nagad'} (${user.bdt_account_2_number})`,
          `withdraw_saved_bdt2`
        )
      ]);
    }

    // Saved USDT Binance ID
    if (user.binance_id) {
      buttons.push([
        Markup.button.callback(
          `Saved: Binance ID (${user.binance_id})`,
          `withdraw_saved_usdt`
        )
      ]);
    }

    // General options
    buttons.push([
      Markup.button.callback('bKash', 'withdraw_method_bKash'),
      Markup.button.callback('Nagad', 'withdraw_method_Nagad')
    ]);
    buttons.push([
      Markup.button.callback('Rocket', 'withdraw_method_Rocket'),
      Markup.button.callback('USDT (Binance ID)', 'withdraw_method_USDT')
    ]);
    buttons.push([Markup.button.callback('Cancel', 'my_wallet')]);

    const promptMsg =
      `<b>Select Cashout Method:</b>\n\n` +
      `Current Balance: <b>${balance.toFixed(2)} ${config.currency}</b>\n\n` +
      `Choose your preferred payout method or select a saved account:`;

    const keyboard = Markup.inlineKeyboard(buttons);

    if (ctx.callbackQuery) {
      await ctx.editMessageText(promptMsg, { parse_mode: 'HTML', ...keyboard });
    } else {
      await ctx.reply(promptMsg, { parse_mode: 'HTML', ...keyboard });
    }
  } catch (err) {
    console.error('Error in handleStartWithdraw:', err);
  }
}

async function handleSelectWithdrawMethod(ctx, method) {
  try {
    const userId = ctx.from.id;
    const user = await db.getUser(userId);

    if (method === 'saved_bdt1' && user && user.bdt_account_1_number) {
      withdrawStates.set(userId, {
        step: 'WAITING_AMOUNT',
        method: user.bdt_account_1_type || 'bKash',
        accountNumber: user.bdt_account_1_number,
        walletType: 'BDT'
      });
      return askAmount(ctx, user, user.bdt_account_1_type || 'bKash', user.bdt_account_1_number);
    }

    if (method === 'saved_bdt2' && user && user.bdt_account_2_number) {
      withdrawStates.set(userId, {
        step: 'WAITING_AMOUNT',
        method: user.bdt_account_2_type || 'Nagad',
        accountNumber: user.bdt_account_2_number,
        walletType: 'BDT'
      });
      return askAmount(ctx, user, user.bdt_account_2_type || 'Nagad', user.bdt_account_2_number);
    }

    if (method === 'saved_usdt' && user && user.binance_id) {
      withdrawStates.set(userId, {
        step: 'WAITING_USDT_AMOUNT',
        method: 'USDT (Binance ID)',
        accountNumber: user.binance_id,
        walletType: 'USDT'
      });
      return askUsdtAmount(ctx, user, user.binance_id);
    }

    const isUsdt = method === 'USDT';
    withdrawStates.set(userId, {
      step: isUsdt ? 'WAITING_BINANCE_ID' : 'WAITING_ACCOUNT',
      method: isUsdt ? 'USDT (Binance ID)' : method,
      walletType: isUsdt ? 'USDT' : 'BDT'
    });

    let msg = '';
    if (isUsdt) {
      msg =
        `<b>USDT Cashout (Binance ID):</b>\n\n` +
        `Please enter your <b>Binance ID</b> (UID or Binance Pay ID):\n\n` +
        `(Type /cancel to abort)`;
    } else {
      msg =
        `<b>Payment Method: ${method}</b>\n\n` +
        `Please enter your <b>${method} account number</b> (11 digits, e.g., <code>017xxxxxxxx</code>):\n\n` +
        `(Type /cancel to abort)`;
    }

    const kb = Markup.inlineKeyboard([
      [Markup.button.callback('Cancel', 'cancel_withdraw')]
    ]);

    if (ctx.callbackQuery) {
      await ctx.editMessageText(msg, { parse_mode: 'HTML', ...kb });
    } else {
      await ctx.reply(msg, { parse_mode: 'HTML', ...kb });
    }
  } catch (err) {
    console.error('Error in handleSelectWithdrawMethod:', err);
  }
}

async function askAmount(ctx, user, method, accountNumber) {
  const balance = parseFloat(user.balance).toFixed(2);
  const msg =
    `Account: <b>${method} - ${accountNumber}</b>\n\n` +
    `Enter Withdrawal Amount:\n` +
    `Minimum: ${config.minWithdraw} ${config.currency}\n` +
    `Max available: ${balance} ${config.currency}\n\n` +
    `Send the amount in BDT you wish to withdraw (e.g. 50):`;

  const kb = Markup.inlineKeyboard([
    [Markup.button.callback('Cancel', 'cancel_withdraw')]
  ]);

  if (ctx.callbackQuery) {
    await ctx.editMessageText(msg, { parse_mode: 'HTML', ...kb });
  } else {
    await ctx.reply(msg, { parse_mode: 'HTML', ...kb });
  }
}

async function askUsdtAmount(ctx, user, binanceId) {
  const balance = parseFloat(user.balance).toFixed(2);
  const maxUsdt = (parseFloat(balance) / config.usdtRate).toFixed(2);
  const msg =
    `Account: <b>Binance ID - ${binanceId}</b>\n\n` +
    `Enter Withdrawal Amount in USDT ($):\n` +
    `Minimum: $${config.minWithdrawUsdt.toFixed(2)} USDT (1 USD)\n` +
    `Exchange Rate: 1 USDT = ${config.usdtRate} ${config.currency}\n` +
    `Max available: $${maxUsdt} USDT (${balance} ${config.currency})\n\n` +
    `Send the amount in USDT you wish to withdraw (e.g. 1.00):`;

  const kb = Markup.inlineKeyboard([
    [Markup.button.callback('Cancel', 'cancel_withdraw')]
  ]);

  if (ctx.callbackQuery) {
    await ctx.editMessageText(msg, { parse_mode: 'HTML', ...kb });
  } else {
    await ctx.reply(msg, { parse_mode: 'HTML', ...kb });
  }
}

async function handleWithdrawText(ctx) {
  const userId = ctx.from.id;
  const state = withdrawStates.get(userId);
  if (!state) return false;

  const text = ctx.message.text.trim();

  if (text.toLowerCase() === '/cancel' || text.toLowerCase() === 'cancel') {
    withdrawStates.delete(userId);
    await ctx.reply('Withdrawal request cancelled.', { parse_mode: 'HTML' });
    return true;
  }

  // Step 1: Input Binance ID
  if (state.step === 'WAITING_BINANCE_ID') {
    if (!text || text.length < 5) {
      await ctx.reply('Please enter a valid Binance ID or Pay ID:');
      return true;
    }

    state.accountNumber = text;
    state.step = 'WAITING_USDT_AMOUNT';
    withdrawStates.set(userId, state);

    const user = await db.getUser(userId);
    return askUsdtAmount(ctx, user, text);
  }

  // Step 2: Input BDT Account Number
  if (state.step === 'WAITING_ACCOUNT') {
    const phoneRegex = /^01[3-9]\d{8}$/;
    if (!phoneRegex.test(text)) {
      await ctx.reply(
        'Invalid phone number!\n\nPlease enter a valid 11-digit mobile number (e.g., 01712345678):',
        { parse_mode: 'HTML' }
      );
      return true;
    }

    state.accountNumber = text;
    state.step = 'WAITING_AMOUNT';
    withdrawStates.set(userId, state);

    const user = await db.getUser(userId);
    return askAmount(ctx, user, state.method, text);
  }

  // Step 3: Input USDT Amount
  if (state.step === 'WAITING_USDT_AMOUNT') {
    const usdtAmt = parseFloat(text);
    const user = await db.getUser(userId);
    const bdtNeeded = usdtAmt * config.usdtRate;
    const balance = parseFloat(user.balance);

    if (isNaN(usdtAmt) || usdtAmt < config.minWithdrawUsdt) {
      await ctx.reply(`Minimum withdrawal is $${config.minWithdrawUsdt.toFixed(2)} USDT (1 USD). Please enter an amount equal or higher:`);
      return true;
    }

    if (bdtNeeded > balance) {
      await ctx.reply(`Insufficient balance! $${usdtAmt.toFixed(2)} USDT requires ${bdtNeeded.toFixed(2)} ${config.currency}. Your balance is ${balance.toFixed(2)} ${config.currency}:`);
      return true;
    }

    state.amount = bdtNeeded;
    state.usdtAmount = usdtAmt;
    state.step = 'CONFIRMATION';
    withdrawStates.set(userId, state);

    const confirmMsg =
      `<b>Confirm Withdrawal:</b>\n\n` +
      `Method: USDT (Binance Pay)\n` +
      `Binance ID: <code>${state.accountNumber}</code>\n` +
      `Amount: <b>$${usdtAmt.toFixed(2)} USDT</b> (${bdtNeeded.toFixed(2)} ${config.currency})\n\n` +
      `Do you confirm this withdrawal request?`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('Confirm and Submit', 'confirm_withdraw'),
        Markup.button.callback('Cancel', 'cancel_withdraw')
      ]
    ]);

    await ctx.reply(confirmMsg, { parse_mode: 'HTML', ...keyboard });
    return true;
  }

  // Step 4: Input BDT Amount
  if (state.step === 'WAITING_AMOUNT') {
    const amount = parseFloat(text);
    const user = await db.getUser(userId);
    const balance = parseFloat(user.balance);

    if (isNaN(amount) || amount <= 0) {
      await ctx.reply('Please enter a valid numerical amount (e.g. 50):');
      return true;
    }

    if (amount < config.minWithdraw) {
      await ctx.reply(
        `Minimum withdrawal limit is <b>${config.minWithdraw} ${config.currency}</b>! Please enter an amount equal or higher:`,
        { parse_mode: 'HTML' }
      );
      return true;
    }

    if (amount > balance) {
      await ctx.reply(
        `Insufficient balance! Your current balance is <b>${balance.toFixed(2)} ${config.currency}</b>:`,
        { parse_mode: 'HTML' }
      );
      return true;
    }

    state.amount = amount;
    state.step = 'CONFIRMATION';
    withdrawStates.set(userId, state);

    const confirmMsg =
      `<b>Confirm Withdrawal:</b>\n\n` +
      `Method: ${state.method}\n` +
      `Account: <code>${state.accountNumber}</code>\n` +
      `Amount: <b>${state.amount.toFixed(2)} ${config.currency}</b>\n\n` +
      `Do you confirm this withdrawal request?`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('Confirm and Submit', 'confirm_withdraw'),
        Markup.button.callback('Cancel', 'cancel_withdraw')
      ]
    ]);

    await ctx.reply(confirmMsg, { parse_mode: 'HTML', ...keyboard });
    return true;
  }

  return false;
}

async function handleConfirmWithdraw(ctx) {
  try {
    const userId = ctx.from.id;
    const state = withdrawStates.get(userId);

    if (!state || state.step !== 'CONFIRMATION') {
      return ctx.answerCbQuery('No active withdrawal request found!', { show_alert: true });
    }

    const { amount, method, accountNumber, usdtAmount } = state;
    withdrawStates.delete(userId);

    const displayMethod = usdtAmount ? `USDT ($${usdtAmount.toFixed(2)} via Binance ID)` : method;

    // Create withdrawal in DB
    const withdrawal = await db.createWithdrawal({
      userId,
      amount,
      method: displayMethod,
      accountNumber
    });

    const user = await db.getUser(userId);

    const successMsg =
      `<b>Withdrawal Request Submitted</b>\n\n` +
      `Request ID: #${withdrawal.id}\n` +
      `Method: ${displayMethod}\n` +
      `Account: <code>${accountNumber}</code>\n` +
      `Amount: ${amount.toFixed(2)} ${config.currency}\n` +
      `Status: Pending Approval\n\n` +
      `Your cashout request will be reviewed and processed shortly.`;

    await ctx.editMessageText(successMsg, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('Back to Wallet', 'my_wallet')]
      ])
    });

    // Notify Admins without emojis
    for (const adminId of config.adminIds) {
      try {
        const adminMsg =
          `New Cashout Request (#${withdrawal.id})\n\n` +
          `User: ${user.first_name || 'Anonymous'} ` +
          (user.username ? `(@${user.username})` : '') + `\n` +
          `User ID: ${userId}\n` +
          `Method: ${displayMethod}\n` +
          `Account: ${accountNumber}\n` +
          `Amount: ${amount.toFixed(2)} ${config.currency}`;

        const adminKeyboard = Markup.inlineKeyboard([
          [
            Markup.button.callback('Approve', `admin_approve_${withdrawal.id}`),
            Markup.button.callback('Reject', `admin_reject_${withdrawal.id}`)
          ]
        ]);

        await ctx.telegram.sendMessage(adminId, adminMsg, {
          parse_mode: 'HTML',
          ...adminKeyboard
        });
      } catch (adminErr) {
        console.error(`Failed to notify admin ${adminId}:`, adminErr.message);
      }
    }
  } catch (err) {
    console.error('Error in handleConfirmWithdraw:', err);
    await ctx.answerCbQuery(`Error: ${err.message}`, { show_alert: true });
  }
}

async function handleCancelWithdraw(ctx) {
  const userId = ctx.from.id;
  withdrawStates.delete(userId);
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery('Withdrawal cancelled.');
    await handleShowWallet(ctx);
  } else {
    await ctx.reply('Withdrawal cancelled.');
  }
}

async function handleWithdrawHistory(ctx) {
  try {
    const userId = ctx.from.id;
    const history = await db.getUserWithdrawals(userId);

    if (!history || history.length === 0) {
      const msg = `<b>Withdrawal History:</b>\n\nYou have not made any cashout requests yet.`;
      return ctx.editMessageText(msg, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('Back to Wallet', 'my_wallet')]
        ])
      });
    }

    let msg = `<b>Your Recent Withdrawals:</b>\n\n`;
    history.forEach((w, i) => {
      let statusText = 'Pending';
      if (w.status === 'approved') statusText = 'Approved (Paid)';
      if (w.status === 'rejected') statusText = 'Rejected (Refunded)';

      msg += `${i + 1}. <b>${w.method}</b> (${w.account_number})\n`;
      msg += `   Amount: ${parseFloat(w.amount).toFixed(2)} ${config.currency} | Status: ${statusText}\n`;
      msg += `   Date: ${new Date(w.created_at).toLocaleDateString()} ${new Date(w.created_at).toLocaleTimeString()}\n\n`;
    });

    await ctx.editMessageText(msg, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('Back to Wallet', 'my_wallet')]
      ])
    });
  } catch (err) {
    console.error('Error in handleWithdrawHistory:', err);
  }
}

module.exports = {
  handleShowWallet,
  handleStartWithdraw,
  handleSelectWithdrawMethod,
  handleWithdrawText,
  handleConfirmWithdraw,
  handleCancelWithdraw,
  handleWithdrawHistory
};
