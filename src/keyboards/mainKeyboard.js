const { Markup } = require('telegraf');
const config = require('../config');

function getMainKeyboard(userOrId, webAppUrl = null) {
  const url = webAppUrl || config.miniAppUrl || config.webhookDomain;
  const buttons = [];

  // 'Open App' button in the reply keyboard if URL is configured
  if (url) {
    buttons.push([Markup.button.webApp('Open App', url)]);
  }

  buttons.push(['Available Tasks', 'My Wallet']);
  buttons.push(['Withdraw Funds', 'Invite & Earn']);
  buttons.push(['Rules & Guide']);

  // Strictly only show Admin Dashboard button to confirmed admins
  if (config.isAdmin(userOrId)) {
    buttons.push(['Admin Dashboard']);
  }

  return Markup.keyboard(buttons).resize();
}

function getMiniAppButton(webAppUrl = null) {
  const url = webAppUrl || config.miniAppUrl || config.webhookDomain;
  if (url) {
    return Markup.inlineKeyboard([
      [Markup.button.webApp('Open App', url)],
      [Markup.button.callback('View Available Tasks', 'tasks_list')]
    ]);
  }
  return Markup.inlineKeyboard([
    [Markup.button.callback('View Available Tasks', 'tasks_list')],
    [Markup.button.callback('My Wallet', 'my_wallet')]
  ]);
}

module.exports = {
  getMainKeyboard,
  getMiniAppButton
};
