// TG BOOST Mini App Client JavaScript
// Strict Clean English, No Emojis, BDT & USDT Wallets, 100% Contrast

const tg = window.Telegram?.WebApp;

// App State
let currentUser = null;
let currentTab = 'homeTab';
let currentWalletType = 'BDT'; // 'BDT' or 'USDT'
let botUsername = 'TgBoost_Monetizebot';
let isDarkMode = true;
let usdtRate = 120.0;
let minWithdrawBdt = 20.0;
let minWithdrawUsdt = 1.0;
let userWallets = [];
let selectedBdtWalletId = null;
let selectedUsdtWalletId = null;
let activeModalWalletType = 'BDT';
let selectedModalProvider = 'bKash';

// DOM Elements
const balanceValueEl = document.getElementById('balanceValue');
const homeUsdtEqEl = document.getElementById('homeUsdtEq');
const totalEarnedValueEl = document.getElementById('totalEarnedValue');
const completedTasksCountEl = document.getElementById('completedTasksCount');
const tasksListEl = document.getElementById('tasksList');
const tasksCountBadgeEl = document.getElementById('tasksCountBadge');
const toastContainer = document.getElementById('toastContainer');
const adminNavBtn = document.getElementById('adminNavBtn');

// Home Profile Elements
const userAvatarImg = document.getElementById('userAvatarImg');
const userAvatarFallback = document.getElementById('userAvatarFallback');
const userDisplayName = document.getElementById('userDisplayName');
const userUsernameTag = document.getElementById('userUsernameTag');
const userIdDisplay = document.getElementById('userIdDisplay');
const homeAdminBadge = document.getElementById('homeAdminBadge');
const copyIdChip = document.getElementById('copyIdChip');
const homeRefCount = document.getElementById('homeRefCount');
const homeRefEarnings = document.getElementById('homeRefEarnings');
const homeRecentActivityList = document.getElementById('homeRecentActivityList');

// Wallet Elements
const tabBdtWalletBtn = document.getElementById('tabBdtWalletBtn');
const tabUsdtWalletBtn = document.getElementById('tabUsdtWalletBtn');
const bdtWalletSection = document.getElementById('bdtWalletSection');
const usdtWalletSection = document.getElementById('usdtWalletSection');

const bdtSavedCountBadge = document.getElementById('bdtSavedCountBadge');
const savedBdtWalletsList = document.getElementById('savedBdtWalletsList');
const openAddBdtModalBtn = document.getElementById('openAddBdtModalBtn');
const bdtSelectedBanner = document.getElementById('bdtSelectedBanner');
const bdtSelectedText = document.getElementById('bdtSelectedText');
const bdtAmountInput = document.getElementById('bdtAmountInput');
const submitBdtWithdrawBtn = document.getElementById('submitBdtWithdrawBtn');

const usdtSavedCountBadge = document.getElementById('usdtSavedCountBadge');
const savedUsdtWalletsList = document.getElementById('savedUsdtWalletsList');
const openAddUsdtModalBtn = document.getElementById('openAddUsdtModalBtn');
const usdtSelectedBanner = document.getElementById('usdtSelectedBanner');
const usdtSelectedText = document.getElementById('usdtSelectedText');
const usdtAmountInput = document.getElementById('usdtAmountInput');
const usdtRateDisplay = document.getElementById('usdtRateDisplay');
const usdtCostPreview = document.getElementById('usdtCostPreview');
const submitUsdtWithdrawBtn = document.getElementById('submitUsdtWithdrawBtn');

// Modal Elements
const addWalletModalBackdrop = document.getElementById('addWalletModalBackdrop');
const addWalletModal = document.getElementById('addWalletModal');
const modalWalletTitle = document.getElementById('modalWalletTitle');
const closeAddWalletModalBtn = document.getElementById('closeAddWalletModalBtn');
const bdtProviderSelectSection = document.getElementById('bdtProviderSelectSection');
const usdtProviderSelectSection = document.getElementById('usdtProviderSelectSection');
const newWalletInputLabel = document.getElementById('newWalletInputLabel');
const newWalletNumberInput = document.getElementById('newWalletNumberInput');
const newWalletHint = document.getElementById('newWalletHint');
const submitAddWalletBtn = document.getElementById('submitAddWalletBtn');

// Initialize Telegram Native Theme (Strictly Automatic)
function initTelegramTheme() {
  if (tg?.colorScheme) {
    isDarkMode = tg.colorScheme === 'dark';
  } else {
    const savedTheme = localStorage.getItem('tg_app_theme');
    if (savedTheme) {
      isDarkMode = savedTheme === 'dark';
    } else {
      isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
  }

  applyTheme(isDarkMode);

  if (tg?.onEvent) {
    tg.onEvent('themeChanged', () => {
      let dark = true;
      if (tg.colorScheme) {
        dark = tg.colorScheme === 'dark';
      }
      applyTheme(dark);
    });
  }
}

function applyTheme(dark) {
  isDarkMode = dark;
  document.documentElement.classList.toggle('dark-theme', dark);
  document.documentElement.classList.toggle('light-theme', !dark);
  document.body.classList.toggle('dark-theme', dark);
  document.body.classList.toggle('light-theme', !dark);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  document.body.setAttribute('data-theme', dark ? 'dark' : 'light');

  if (tg) {
    try {
      if (tg.setHeaderColor) tg.setHeaderColor(dark ? '#0c141d' : '#ffffff');
      if (tg.setBackgroundColor) tg.setBackgroundColor(dark ? '#0c141d' : '#f4f6fa');
    } catch (e) {}
  }
}

// Initialize Telegram WebApp SDK
function initTelegramApp() {
  if (tg) {
    try {
      tg.ready();
      tg.expand();
      if (tg.enableClosingConfirmation) tg.enableClosingConfirmation();
    } catch (e) {
      console.warn('Telegram WebApp init warning:', e);
    }
  }

  let tgUser = tg?.initDataUnsafe?.user;
  let startParam = tg?.initDataUnsafe?.start_param || null;

  if (!tgUser) {
    const params = new URLSearchParams(window.location.search);
    const idFromParam = params.get('userId') || params.get('id');
    const nameFromParam = params.get('name');
    const userFromParam = params.get('username');
    const isAdminTest = params.get('admin') === 'true';

    if (idFromParam) {
      tgUser = {
        id: idFromParam,
        first_name: nameFromParam || 'Browser User',
        username: userFromParam || 'tg_user'
      };
    } else if (isAdminTest) {
      tgUser = {
        id: '8813841499',
        first_name: 'Admin',
        username: 'TgBoost_Ajent'
      };
    } else {
      // Default fallback profile for testing in browser
      tgUser = {
        id: '710029381',
        first_name: 'John Doe',
        username: 'johndoe_tg'
      };
    }
  }

  // Instant synchronous pre-render of profile details (0ms speed)
  const fullName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') || tgUser.username || 'Member';
  if (userDisplayName) userDisplayName.textContent = fullName;
  if (userUsernameTag) userUsernameTag.textContent = tgUser.username ? `@${tgUser.username}` : `@id_${tgUser.id}`;
  if (userIdDisplay) userIdDisplay.textContent = tgUser.id;

  if (tgUser.photo_url && userAvatarImg) {
    userAvatarImg.src = tgUser.photo_url;
    userAvatarImg.style.display = 'block';
    if (userAvatarFallback) userAvatarFallback.style.display = 'none';
  } else if (userAvatarFallback) {
    userAvatarFallback.textContent = (fullName[0] || 'M').toUpperCase();
    userAvatarFallback.style.display = 'flex';
    if (userAvatarImg) userAvatarImg.style.display = 'none';
  }

  // Restore cached stats if available for instant display
  try {
    const cached = localStorage.getItem('tg_user_cache_' + tgUser.id);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (balanceValueEl && parsed.balance !== undefined) {
        balanceValueEl.textContent = parseFloat(parsed.balance).toFixed(2);
        if (homeUsdtEqEl) {
          homeUsdtEqEl.textContent = `≈ $${(parseFloat(parsed.balance) / 120.0).toFixed(2)} USDT`;
        }
      }
      if (totalEarnedValueEl && parsed.total_earned !== undefined) totalEarnedValueEl.textContent = parseFloat(parsed.total_earned).toFixed(2);
      if (completedTasksCountEl && parsed.completed_count !== undefined) completedTasksCountEl.textContent = parsed.completed_count;
    }
  } catch (e) {}

  return { tgUser, startParam };
}

// Show Floating Toast Notification (No emojis)
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let iconSvg = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
  if (type === 'success') {
    iconSvg = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>';
  } else if (type === 'error') {
    iconSvg = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
  }

  toast.innerHTML = `<span>${iconSvg}</span><span>${message}</span>`;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Trigger Haptic Feedback
function triggerHaptic(type = 'medium') {
  if (tg?.HapticFeedback) {
    if (type === 'success' || type === 'error' || type === 'warning') {
      tg.HapticFeedback.notificationOccurred(type);
    } else {
      tg.HapticFeedback.impactOccurred(type);
    }
  }
}

// Load User Data from API
async function loadUserData(tgUser, startParam) {
  try {
    let url = `/api/user?id=${tgUser.id}&first_name=${encodeURIComponent(tgUser.first_name || '')}&username=${encodeURIComponent(tgUser.username || '')}`;
    if (startParam) {
      const refId = startParam.replace('ref_', '');
      url += `&referrer=${refId}`;
    }

    const res = await fetch(url);
    const data = await res.json();

    if (data.error) throw new Error(data.error);

    currentUser = data.user;
    currentUser.isAdmin = !!data.isAdmin;
    currentUser.currency = data.currency || '৳';
    currentUser.minWithdraw = data.minWithdraw || 20;
    currentUser.usdtRate = data.usdtRate || 120.0;
    currentUser.minWithdrawUsdt = data.minWithdrawUsdt || 1.0;

    usdtRate = currentUser.usdtRate;
    minWithdrawBdt = currentUser.minWithdraw;
    minWithdrawUsdt = currentUser.minWithdrawUsdt;

    if (usdtRateDisplay) {
      usdtRateDisplay.textContent = usdtRate.toFixed(2);
    }

    // Populate Home Profile Details
    const fullName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') || currentUser.username || 'Member';
    userDisplayName.textContent = fullName;
    userUsernameTag.textContent = tgUser.username ? `@${tgUser.username}` : `@id_${currentUser.id}`;
    userIdDisplay.textContent = currentUser.id;

    // Profile photo handling from Telegram
    if (tgUser.photo_url) {
      userAvatarImg.src = tgUser.photo_url;
      userAvatarImg.style.display = 'block';
      userAvatarFallback.style.display = 'none';
    } else {
      userAvatarFallback.textContent = (fullName[0] || 'M').toUpperCase();
      userAvatarFallback.style.display = 'flex';
      userAvatarImg.style.display = 'none';
    }

    // STRICT ADMIN VISIBILITY
    if (currentUser.isAdmin === true) {
      homeAdminBadge.style.display = 'inline-block';
      adminNavBtn.style.display = 'flex';
    } else {
      homeAdminBadge.style.display = 'none';
      adminNavBtn.style.display = 'none';
      if (currentTab === 'adminTab') {
        switchTab('homeTab');
      }
    }

    // Update Balance & Stats
    updateBalanceDisplay(currentUser.balance, currentUser.total_earned, data.completedCount);

    // Populate Saved Wallets in UI
    userWallets = data.wallets || [];
    renderSavedWalletsUI();

    // Populate Recent Activity on Home
    renderHomeRecentActivity(data.recentTasks || [], data.recentWithdrawals || []);

    // Update Affiliate Section
    const refCount = currentUser.referral_count || 0;
    const refEarnings = (refCount * (data.referralReward || 1)).toFixed(2);
    
    document.getElementById('refCountDisplay').textContent = refCount;
    document.getElementById('refEarningsDisplay').textContent = refEarnings;
    homeRefCount.textContent = refCount;
    homeRefEarnings.textContent = refEarnings;

    const refLink = `https://t.me/${botUsername}?start=ref_${currentUser.id}`;
    document.getElementById('referralLinkInput').value = refLink;

    // Preload Tasks & History
    loadTasks();
    loadWithdrawalHistory();
  } catch (err) {
    console.error('Error loading user data:', err);
    showToast('Failed to load user profile.', 'error');
  }
}

// Update Balance Display
function updateBalanceDisplay(balance, totalEarned, completedCount) {
  const balNum = parseFloat(balance || 0);
  balanceValueEl.textContent = balNum.toFixed(2);
  totalEarnedValueEl.textContent = parseFloat(totalEarned || 0).toFixed(2);
  
  if (homeUsdtEqEl) {
    const usdtEq = (balNum / usdtRate).toFixed(2);
    homeUsdtEqEl.textContent = `≈ $${usdtEq} USDT`;
  }

  if (completedCount !== undefined) {
    completedTasksCountEl.textContent = completedCount;
  }

  // Cache updated values for 0ms initial load next time
  try {
    if (currentUser?.id) {
      localStorage.setItem('tg_user_cache_' + currentUser.id, JSON.stringify({
        balance: balNum,
        total_earned: totalEarned,
        completed_count: completedCount !== undefined ? completedCount : completedTasksCountEl?.textContent
      }));
    }
  } catch (e) {}
}

// ================= MODERN WALLET MANAGEMENT =================

// Privacy Masking: First 4 digits + **** + Last 3 digits (Strict Privacy)
function maskAccountNumber(num) {
  if (!num) return '';
  const s = String(num).trim();
  if (s.length >= 7) {
    const first4 = s.substring(0, 4);
    const last3 = s.substring(s.length - 3);
    return `${first4}****${last3}`;
  }
  if (s.length > 4) {
    return s.substring(0, 2) + '****' + s.substring(s.length - 2);
  }
  return s;
}

// Render Saved Wallets in UI
function renderSavedWalletsUI() {
  const bdtWallets = userWallets.filter(w => (w.wallet_type || '').toUpperCase() === 'BDT');
  const usdtWallets = userWallets.filter(w => (w.wallet_type || '').toUpperCase() === 'USDT');

  if (bdtSavedCountBadge) bdtSavedCountBadge.textContent = `${bdtWallets.length} Saved`;
  if (usdtSavedCountBadge) usdtSavedCountBadge.textContent = `${usdtWallets.length} Saved`;

  // Auto-select default or first if none selected
  if (!selectedBdtWalletId && bdtWallets.length > 0) {
    const def = bdtWallets.find(w => w.is_default === 1) || bdtWallets[0];
    selectedBdtWalletId = def.id;
  } else if (selectedBdtWalletId && !bdtWallets.some(w => w.id === selectedBdtWalletId)) {
    selectedBdtWalletId = bdtWallets.length > 0 ? bdtWallets[0].id : null;
  }

  if (!selectedUsdtWalletId && usdtWallets.length > 0) {
    const def = usdtWallets.find(w => w.is_default === 1) || usdtWallets[0];
    selectedUsdtWalletId = def.id;
  } else if (selectedUsdtWalletId && !usdtWallets.some(w => w.id === selectedUsdtWalletId)) {
    selectedUsdtWalletId = usdtWallets.length > 0 ? usdtWallets[0].id : null;
  }

  // Hide Add Account button when 2 accounts are saved
  if (openAddBdtModalBtn) {
    openAddBdtModalBtn.style.display = bdtWallets.length >= 2 ? 'none' : 'flex';
  }
  if (openAddUsdtModalBtn) {
    openAddUsdtModalBtn.style.display = usdtWallets.length >= 2 ? 'none' : 'flex';
  }

  // Render BDT List
  if (savedBdtWalletsList) {
    if (bdtWallets.length === 0) {
      savedBdtWalletsList.innerHTML = `
        <div style="font-size: 12px; color: var(--text-dim); text-align: center; padding: 12px 0;">
          No saved BDT accounts yet. Tap below to add your bKash or Nagad account.
        </div>
      `;
    } else {
      let html = '';
      bdtWallets.forEach(w => {
        const isSelected = w.id === selectedBdtWalletId;
        const provClass = (w.provider || 'bkash').toLowerCase();
        const provLogo = provClass === 'nagad' ? '/img/na.png' : '/img/bk.png';
        html += `
          <div class="saved-wallet-card ${isSelected ? 'selected' : ''}" onclick="selectWalletAccount(${w.id}, 'BDT')">
            <div class="wallet-card-left">
              <div class="provider-badge ${provClass}">
                <img src="${provLogo}" alt="${w.provider}" class="provider-badge-img">
                <span class="provider-badge-text">${w.provider}</span>
              </div>
              <div class="wallet-card-info">
                <span class="wallet-masked-number">${maskAccountNumber(w.account_number)}</span>
                <span class="wallet-provider-sub">${w.provider} Personal Account</span>
              </div>
            </div>
            <div class="wallet-card-right">
              <div class="custom-radio-circle">
                <div class="radio-inner-dot"></div>
              </div>
            </div>
          </div>
        `;
      });
      savedBdtWalletsList.innerHTML = html;
    }
  }

  // Update BDT Selected Account Banner
  if (bdtSelectedBanner && bdtSelectedText) {
    const selectedBdt = bdtWallets.find(w => w.id === selectedBdtWalletId);
    if (selectedBdt) {
      const isNagad = (selectedBdt.provider || '').toLowerCase() === 'nagad';
      const bannerLogo = isNagad ? '/img/na.png' : '/img/bk.png';
      bdtSelectedText.innerHTML = `
        <div class="dest-account-card">
          <div class="dest-logo-col">
            <img src="${bannerLogo}" alt="${selectedBdt.provider}" class="dest-logo-img">
            <span class="dest-logo-name" style="color: ${isNagad ? '#f7941d' : '#f02d84'};">${selectedBdt.provider}</span>
          </div>
          <div class="dest-info-col">
            <div class="dest-account-num">${maskAccountNumber(selectedBdt.account_number)}</div>
            <div class="dest-account-sub">${selectedBdt.provider} Personal Account</div>
          </div>
        </div>
      `;
    } else {
      bdtSelectedText.innerHTML = `Please select or add an account above`;
    }
  }

  // Render USDT List
  if (savedUsdtWalletsList) {
    if (usdtWallets.length === 0) {
      savedUsdtWalletsList.innerHTML = `
        <div style="font-size: 12px; color: var(--text-dim); text-align: center; padding: 12px 0;">
          No saved Binance accounts yet. Tap below to add your Binance Pay ID / UID.
        </div>
      `;
    } else {
      let html = '';
      usdtWallets.forEach(w => {
        const isSelected = w.id === selectedUsdtWalletId;
        html += `
          <div class="saved-wallet-card ${isSelected ? 'selected' : ''}" onclick="selectWalletAccount(${w.id}, 'USDT')">
            <div class="wallet-card-left">
              <div class="provider-badge binance">
                <img src="/img/bi.png" alt="Binance" class="provider-badge-img">
                <span class="provider-badge-text">Binance</span>
              </div>
              <div class="wallet-card-info">
                <span class="wallet-masked-number">${maskAccountNumber(w.account_number)}</span>
                <span class="wallet-provider-sub">Binance UID / Pay ID</span>
              </div>
            </div>
            <div class="wallet-card-right">
              <div class="custom-radio-circle">
                <div class="radio-inner-dot"></div>
              </div>
            </div>
          </div>
        `;
      });
      savedUsdtWalletsList.innerHTML = html;
    }
  }

  // Update USDT Selected Account Banner
  if (usdtSelectedBanner && usdtSelectedText) {
    const selectedUsdt = usdtWallets.find(w => w.id === selectedUsdtWalletId);
    if (selectedUsdt) {
      usdtSelectedText.innerHTML = `
        <div class="dest-account-card">
          <div class="dest-logo-col">
            <img src="/img/bi.png" alt="Binance" class="dest-logo-img">
            <span class="dest-logo-name" style="color: #f0b90b;">Binance</span>
          </div>
          <div class="dest-info-col">
            <div class="dest-account-num">${maskAccountNumber(selectedUsdt.account_number)}</div>
            <div class="dest-account-sub">Binance UID / Pay ID</div>
          </div>
        </div>
      `;
    } else {
      usdtSelectedText.innerHTML = `Please select or add a Binance ID above`;
    }
  }
}

// Select a Wallet Account
async function selectWalletAccount(id, walletType) {
  triggerHaptic('light');
  if (walletType === 'BDT') {
    selectedBdtWalletId = id;
  } else {
    selectedUsdtWalletId = id;
  }
  renderSavedWalletsUI();

  // Save selection as default on server
  if (currentUser) {
    try {
      await fetch('/api/wallet/select-default', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id, walletId: id })
      });
    } catch (e) {}
  }
}

// Delete a Saved Wallet Account
async function deleteWalletAccount(event, id) {
  event.stopPropagation();
  triggerHaptic('medium');
  if (!confirm('Are you sure you want to remove this saved account?')) return;

  try {
    const res = await fetch('/api/wallet/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id, walletId: id })
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Failed to delete account');

    userWallets = data.wallets || [];
    renderSavedWalletsUI();
    showToast('Account removed successfully.', 'info');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Open Add Wallet Modal
function openAddWalletModal(type) {
  activeModalWalletType = type;
  triggerHaptic('light');

  const noticeEl = document.getElementById('modalNoticeText');
  if (type === 'BDT') {
    modalWalletTitle.textContent = 'Add Withdrawal Account';
    if (noticeEl) noticeEl.innerHTML = 'Please enter your <b>Personal Account</b> only (Agent or Merchant numbers are not supported).';
    bdtProviderSelectSection.style.display = 'block';
    usdtProviderSelectSection.style.display = 'none';
    newWalletInputLabel.textContent = 'Account Number (11 Digits):';
    newWalletNumberInput.placeholder = '01XXXXXXXXX';
    newWalletNumberInput.maxLength = 11;
    newWalletNumberInput.type = 'tel';
    newWalletHint.textContent = 'Enter your full 11-digit mobile number starting with 0.';
    selectModalProvider('bKash');
  } else {
    modalWalletTitle.textContent = 'Add Binance Pay / USDT';
    if (noticeEl) noticeEl.innerHTML = 'Please enter your <b>Personal Binance Pay ID or UID</b> for direct USDT payouts.';
    bdtProviderSelectSection.style.display = 'none';
    usdtProviderSelectSection.style.display = 'block';
    newWalletInputLabel.textContent = 'Binance ID (UID or Binance Pay ID):';
    newWalletNumberInput.placeholder = 'e.g. 123456789';
    newWalletNumberInput.maxLength = 30;
    newWalletNumberInput.type = 'text';
    newWalletHint.textContent = 'Enter your numeric Binance UID or Pay ID.';
    selectModalProvider('Binance Pay');
  }

  newWalletNumberInput.value = '';
  addWalletModalBackdrop.style.display = 'flex';
  setTimeout(() => newWalletNumberInput.focus(), 150);
}

// Close Add Wallet Modal
function closeAddWalletModal() {
  triggerHaptic('light');
  addWalletModalBackdrop.style.display = 'none';
}

// Select Modal Provider
function selectModalProvider(provider) {
  selectedModalProvider = provider;
  document.querySelectorAll('.provider-select-pill').forEach(pill => {
    if (pill.getAttribute('data-provider') === provider) {
      pill.classList.add('active');
    } else {
      pill.classList.remove('active');
    }
  });
}

// Submit Add New Wallet
async function submitAddNewWallet() {
  if (!currentUser) return;
  const num = newWalletNumberInput.value.trim();

  if (!num) {
    showToast('Please enter your account number.', 'error');
    return;
  }

  if (activeModalWalletType === 'BDT') {
    const phoneRegex = /^01[3-9]\d{8}$/;
    if (!phoneRegex.test(num)) {
      showToast('Must be an 11-digit mobile number starting with 01 (01XXXXXXXXX)', 'error');
      return;
    }
  } else {
    if (num.length < 5) {
      showToast('Binance ID must be at least 5 characters.', 'error');
      return;
    }
  }

  submitAddWalletBtn.disabled = true;
  submitAddWalletBtn.textContent = 'Saving...';
  triggerHaptic('medium');

  try {
    const res = await fetch('/api/wallet/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUser.id,
        walletType: activeModalWalletType,
        provider: selectedModalProvider,
        accountNumber: num
      })
    });

    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Failed to add account');

    userWallets = data.wallets || [];
    if (data.wallet) {
      if (activeModalWalletType === 'BDT') {
        selectedBdtWalletId = data.wallet.id;
      } else {
        selectedUsdtWalletId = data.wallet.id;
      }
    }

    renderSavedWalletsUI();
    closeAddWalletModal();
    triggerHaptic('success');
    showToast(`${selectedModalProvider} account saved successfully!`, 'success');
  } catch (err) {
    triggerHaptic('error');
    showToast(err.message, 'error');
  } finally {
    submitAddWalletBtn.disabled = false;
    submitAddWalletBtn.textContent = 'Save Account';
  }
}

// Render Recent Activity on Home Tab
function renderHomeRecentActivity(recentTasks, recentWithdrawals) {
  if (!homeRecentActivityList) return;

  const activities = [];

  // Add recent completed tasks
  (recentTasks || []).forEach(t => {
    activities.push({
      type: 'task',
      title: t.title || 'Channel Task Completed',
      meta: `+${parseFloat(t.reward).toFixed(2)} ${currentUser.currency}`,
      time: t.completed_at,
      badge: 'Earned'
    });
  });

  // Add recent withdrawals
  (recentWithdrawals || []).forEach(w => {
    let statusText = 'Pending';
    if (w.status === 'approved') statusText = 'Paid';
    if (w.status === 'rejected') statusText = 'Refunded';

    activities.push({
      type: 'withdraw',
      title: `Cashout: ${w.method}`,
      meta: `-${parseFloat(w.amount).toFixed(2)} ${currentUser.currency}`,
      time: w.created_at,
      badge: statusText
    });
  });

  // Sort by newest first
  activities.sort((a, b) => new Date(b.time) - new Date(a.time));

  if (activities.length === 0) {
    homeRecentActivityList.innerHTML = `
      <div class="empty-box" style="padding: 16px 10px;">
        <div class="empty-box-sub">No recent activity yet. Complete tasks or invite friends to start earning.</div>
      </div>
    `;
    return;
  }

  let html = '';
  activities.slice(0, 5).forEach(act => {
    let badgeClass = 'badge-tag';
    if (act.badge === 'Earned' || act.badge === 'Paid') badgeClass = 'status-tag status-approved';
    if (act.badge === 'Pending') badgeClass = 'status-tag status-pending';
    if (act.badge === 'Refunded') badgeClass = 'status-tag status-rejected';

    const timeFormatted = act.time ? new Date(act.time).toLocaleDateString() : '';

    html += `
      <div class="history-row">
        <div>
          <div class="history-col-main">${act.title}</div>
          <div class="history-col-sub">${timeFormatted}</div>
        </div>
        <div style="text-align: right;">
          <div class="history-amount">${act.meta}</div>
          <span class="${badgeClass}">${act.badge}</span>
        </div>
      </div>
    `;
  });

  homeRecentActivityList.innerHTML = html;
}

// Load Tasks
async function loadTasks() {
  if (!currentUser) return;
  try {
    tasksListEl.innerHTML = `
      <div class="empty-box">
        <div class="empty-box-title">Loading Tasks...</div>
        <div class="empty-box-sub">Checking available channels</div>
      </div>
    `;

    const res = await fetch(`/api/tasks?userId=${currentUser.id}`);
    const data = await res.json();
    const tasks = data.tasks || [];

    tasksCountBadgeEl.textContent = tasks.length;

    if (tasks.length === 0) {
      tasksListEl.innerHTML = `
        <div class="empty-box">
          <div class="empty-box-title">All Caught Up!</div>
          <div class="empty-box-sub">No active channel tasks available right now. New tasks will appear here as soon as they are published.</div>
        </div>
      `;
      return;
    }

    let html = '';
    tasks.forEach((task) => {
      const rewardFormatted = parseFloat(task.reward).toFixed(2);
      html += `
        <div class="task-card" id="taskCard_${task.id}">
          <div class="task-top">
            <div class="task-left-meta">
              <div class="task-icon-box">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M21.5 3.5L2 11.5L9.5 14.5L12 21.5L15.5 17L19.5 20L21.5 3.5Z" fill="var(--tg-blue)"/>
                  <path d="M9.5 14.5L21.5 3.5L12 16.5" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
              <div class="task-info-box">
                <div class="task-heading">${task.title}</div>
                <div class="task-sub-label">
                  <span>Official Channel</span>
                  <span>•</span>
                  <span>Task #${task.id}</span>
                </div>
              </div>
            </div>
            <div class="reward-pill">+${rewardFormatted} ${currentUser.currency}</div>
          </div>
          <div class="task-btn-grid">
            <a href="${task.channel_link}" target="_blank" class="btn-join-channel" onclick="triggerHaptic('light')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
              Join Channel
            </a>
            <button class="btn-verify-task" id="verifyBtn_${task.id}" onclick="verifyTask(${task.id})">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
              Verify
            </button>
          </div>
        </div>
      `;
    });

    tasksListEl.innerHTML = html;
  } catch (err) {
    console.error('Error loading tasks:', err);
    tasksListEl.innerHTML = `
      <div class="empty-box">
        <div class="empty-box-title">Failed to load tasks</div>
      </div>
    `;
  }
}

// Verify Task Action
async function verifyTask(taskId) {
  if (!currentUser) return;
  const btn = document.getElementById(`verifyBtn_${taskId}`);
  if (!btn || btn.disabled) return;

  btn.disabled = true;
  const originalText = btn.innerHTML;
  btn.innerHTML = 'Verifying...';
  triggerHaptic('medium');

  try {
    const res = await fetch('/api/verify-task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId, userId: currentUser.id })
    });

    const result = await res.json();

    if (!res.ok || result.error) {
      throw new Error(result.error || 'Verification failed');
    }

    triggerHaptic('success');
    if (window.confetti) {
      window.confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.7 }
      });
    } else {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js';
      script.onload = () => {
        if (window.confetti) {
          window.confetti({ particleCount: 80, spread: 60, origin: { y: 0.7 } });
        }
      };
      document.body.appendChild(script);
    }

    showToast(result.message || 'Verification successful!', 'success');

    // Update User Balance & UI
    currentUser.balance = result.user.balance;
    currentUser.total_earned = result.user.total_earned;
    const currentCompleted = parseInt(completedTasksCountEl.textContent || '0', 10) + 1;
    updateBalanceDisplay(currentUser.balance, currentUser.total_earned, currentCompleted);

    // Remove task card smoothly
    const card = document.getElementById(`taskCard_${taskId}`);
    if (card) {
      card.style.transform = 'scale(0.95)';
      card.style.opacity = '0';
      card.style.transition = 'all 0.25s ease';
      setTimeout(() => {
        card.remove();
        const remaining = document.querySelectorAll('.task-card').length;
        tasksCountBadgeEl.textContent = remaining;
        if (remaining === 0) {
          loadTasks();
        }
      }, 250);
    }
  } catch (err) {
    console.error('Verify error:', err);
    triggerHaptic('error');
    showToast(err.message, 'error');
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

// Submit BDT Cashout
async function submitBdtWithdrawal() {
  if (!currentUser) return;

  const selectedWallet = userWallets.find(w => w.id === selectedBdtWalletId && (w.wallet_type || '').toUpperCase() === 'BDT');
  if (!selectedWallet) {
    showToast('Please add or select a BDT account above.', 'error');
    return;
  }

  const amount = parseFloat(bdtAmountInput.value);
  if (isNaN(amount) || amount <= 0) {
    showToast('Please enter a valid withdrawal amount.', 'error');
    return;
  }

  if (amount < minWithdrawBdt) {
    showToast(`Minimum cashout is ${minWithdrawBdt} ${currentUser.currency}`, 'error');
    return;
  }

  if (amount > parseFloat(currentUser.balance)) {
    showToast('Insufficient wallet balance!', 'error');
    return;
  }

  submitBdtWithdrawBtn.disabled = true;
  submitBdtWithdrawBtn.textContent = 'Submitting...';
  triggerHaptic('medium');

  try {
    const res = await fetch('/api/withdraw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUser.id,
        walletType: 'BDT',
        method: selectedWallet.provider,
        accountNumber: selectedWallet.account_number,
        amount
      })
    });

    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Withdrawal failed');

    triggerHaptic('success');
    showToast(`BDT cashout to ${selectedWallet.provider} submitted successfully!`, 'success');

    currentUser.balance = data.user.balance;
    updateBalanceDisplay(currentUser.balance, currentUser.total_earned);

    bdtAmountInput.value = '';
    loadWithdrawalHistory();
  } catch (err) {
    triggerHaptic('error');
    showToast(err.message, 'error');
  } finally {
    submitBdtWithdrawBtn.disabled = false;
    submitBdtWithdrawBtn.textContent = 'Submit BDT Cashout';
  }
}

// Submit USDT Cashout
async function submitUsdtWithdrawal() {
  if (!currentUser) return;

  const selectedWallet = userWallets.find(w => w.id === selectedUsdtWalletId && (w.wallet_type || '').toUpperCase() === 'USDT');
  if (!selectedWallet) {
    showToast('Please add or select a Binance Pay account above.', 'error');
    return;
  }

  const usdtAmt = parseFloat(usdtAmountInput.value);
  if (isNaN(usdtAmt) || usdtAmt <= 0) {
    showToast('Please enter an amount in USDT.', 'error');
    return;
  }

  if (usdtAmt < minWithdrawUsdt) {
    showToast(`Minimum USDT withdrawal is $${minWithdrawUsdt.toFixed(2)} (1 USD)`, 'error');
    return;
  }

  const bdtNeeded = usdtAmt * usdtRate;
  if (bdtNeeded > parseFloat(currentUser.balance)) {
    showToast(`Insufficient balance! $${usdtAmt.toFixed(2)} USDT requires ${bdtNeeded.toFixed(2)} ৳`, 'error');
    return;
  }

  submitUsdtWithdrawBtn.disabled = true;
  submitUsdtWithdrawBtn.textContent = 'Submitting...';
  triggerHaptic('medium');

  try {
    const res = await fetch('/api/withdraw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUser.id,
        walletType: 'USDT',
        method: 'Binance Pay',
        accountNumber: selectedWallet.account_number,
        amount: usdtAmt
      })
    });

    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'USDT withdrawal failed');

    triggerHaptic('success');
    showToast(`USDT cashout for $${usdtAmt.toFixed(2)} submitted!`, 'success');

    currentUser.balance = data.user.balance;
    currentUser.binance_id = selectedWallet.account_number;
    updateBalanceDisplay(currentUser.balance, currentUser.total_earned);

    usdtAmountInput.value = '';
    loadWithdrawalHistory();
  } catch (err) {
    triggerHaptic('error');
    showToast(err.message, 'error');
  } finally {
    submitUsdtWithdrawBtn.disabled = false;
    submitUsdtWithdrawBtn.textContent = 'Submit USDT Cashout';
  }
}

// Load Withdrawal History
async function loadWithdrawalHistory() {
  if (!currentUser) return;
  const listEl = document.getElementById('withdrawHistoryList');
  try {
    const res = await fetch(`/api/withdrawals?userId=${currentUser.id}`);
    const data = await res.json();
    const history = data.history || [];

    if (history.length === 0) {
      listEl.innerHTML = `
        <div class="empty-box">
          <div class="empty-box-title">No Transactions Yet</div>
          <div class="empty-box-sub">Your cashout requests will appear here</div>
        </div>
      `;
      return;
    }

    let html = '';
    history.forEach(item => {
      let badgeClass = 'status-pending';
      let badgeText = 'Pending';
      if (item.status === 'approved') {
        badgeClass = 'status-approved';
        badgeText = 'Paid';
      } else if (item.status === 'rejected') {
        badgeClass = 'status-rejected';
        badgeText = 'Rejected';
      }

      html += `
        <div class="history-row">
          <div>
            <div class="history-col-main">${item.method} (${item.account_number})</div>
            <div class="history-col-sub">${new Date(item.created_at).toLocaleDateString()} ${new Date(item.created_at).toLocaleTimeString()}</div>
          </div>
          <div style="text-align: right;">
            <div class="history-amount">${parseFloat(item.amount).toFixed(2)} ${currentUser.currency}</div>
            <span class="status-tag ${badgeClass}">${badgeText}</span>
          </div>
        </div>
      `;
    });

    listEl.innerHTML = html;
  } catch (err) {
    console.error('Error loading history:', err);
  }
}

// Load Admin Panel Data (Protected)
async function loadAdminData() {
  if (!currentUser || !currentUser.isAdmin) return;
  try {
    const statsRes = await fetch(`/api/admin/stats?adminId=${currentUser.id}&adminUsername=${currentUser.username || ''}`);
    const statsData = await statsRes.json();
    if (statsData.stats) {
      document.getElementById('adminTotalUsers').textContent = statsData.stats.totalUsers;
      document.getElementById('adminTotalTasks').textContent = statsData.stats.totalTasks;
      document.getElementById('adminTotalPaid').textContent = `${statsData.stats.totalPaid.toFixed(2)} ${currentUser.currency}`;
      document.getElementById('adminPendingCount').textContent = statsData.stats.pendingWithdrawals;
    }

    const withRes = await fetch(`/api/admin/withdrawals?adminId=${currentUser.id}&adminUsername=${currentUser.username || ''}`);
    const withData = await withRes.json();
    const pendingListEl = document.getElementById('adminWithdrawalsList');

    if (!withData.pending || withData.pending.length === 0) {
      pendingListEl.innerHTML = `<div class="empty-box"><div class="empty-box-title">No Pending Cashouts</div></div>`;
    } else {
      let html = '';
      withData.pending.forEach(w => {
        html += `
          <div class="history-row" id="adminW_${w.id}">
            <div>
              <div class="history-col-main">${w.first_name || 'Member'} (@${w.username || 'N/A'})</div>
              <div style="font-size: 11px; color: var(--text-muted);">${w.method} - <code>${w.account_number}</code></div>
              <div class="history-col-sub">${parseFloat(w.amount).toFixed(2)} ${currentUser.currency} • ${new Date(w.created_at).toLocaleTimeString()}</div>
            </div>
            <div style="display: flex; gap: 6px;">
              <button class="btn-blue" style="padding: 6px 10px; font-size: 11px;" onclick="handleAdminWithdrawAction(${w.id}, 'approve')">Approve</button>
              <button class="btn-outline" style="padding: 6px 10px; font-size: 11px; color: #ef4444;" onclick="handleAdminWithdrawAction(${w.id}, 'reject')">Reject</button>
            </div>
          </div>
        `;
      });
      pendingListEl.innerHTML = html;
    }

    const tasksRes = await fetch(`/api/admin/tasks?adminId=${currentUser.id}&adminUsername=${currentUser.username || ''}`);
    const tasksData = await tasksRes.json();
    const tasksListEl = document.getElementById('adminTasksList');

    if (!tasksData.tasks || tasksData.tasks.length === 0) {
      tasksListEl.innerHTML = `<div class="empty-box"><div class="empty-box-title">No tasks created yet</div></div>`;
    } else {
      let html = '';
      tasksData.tasks.forEach(t => {
        const isActive = t.is_active === 1;
        html += `
          <div class="history-row" id="adminT_${t.id}">
            <div>
              <div class="history-col-main">#${t.id} ${t.title}</div>
              <div style="font-size: 11px; color: var(--text-muted);">${t.channel_id} • +${parseFloat(t.reward).toFixed(2)} ${currentUser.currency}</div>
              <div class="history-col-sub">Completed: ${t.completed_count} / ${t.max_users === 0 ? 'Unlimited' : t.max_users}</div>
            </div>
            <div style="display: flex; gap: 6px;">
              <button class="btn-outline" style="padding: 5px 9px; font-size: 11px;" onclick="toggleAdminTask(${t.id})">
                ${isActive ? 'Pause' : 'Resume'}
              </button>
              <button class="btn-outline" style="padding: 5px 9px; font-size: 11px; color: #ef4444;" onclick="deleteAdminTask(${t.id})">
                Delete
              </button>
            </div>
          </div>
        `;
      });
      tasksListEl.innerHTML = html;
    }
  } catch (err) {
    console.error('Error loading admin data:', err);
  }
}

// Admin Withdraw Actions
async function handleAdminWithdrawAction(withdrawalId, action) {
  if (!confirm(`Are you sure you want to ${action.toUpperCase()} this withdrawal?`)) return;
  triggerHaptic('medium');
  try {
    const res = await fetch('/api/admin/withdrawals/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adminId: currentUser.id,
        adminUsername: currentUser.username || '',
        withdrawalId,
        action
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(action === 'approve' ? 'Withdrawal approved and paid!' : 'Withdrawal rejected and refunded!', 'success');
      loadAdminData();
    }
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// Admin Task Actions
async function toggleAdminTask(taskId) {
  triggerHaptic('light');
  await fetch('/api/admin/tasks/toggle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ adminId: currentUser.id, adminUsername: currentUser.username || '', taskId })
  });
  loadAdminData();
}

async function deleteAdminTask(taskId) {
  if (!confirm('Are you sure you want to delete this task?')) return;
  triggerHaptic('medium');
  await fetch('/api/admin/tasks/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ adminId: currentUser.id, adminUsername: currentUser.username || '', taskId })
  });
  loadAdminData();
}

// Admin Create Task
async function submitAdminCreateTask() {
  const title = document.getElementById('adminTaskTitle').value.trim();
  const channelId = document.getElementById('adminTaskChannelId').value.trim();
  const link = document.getElementById('adminTaskLink').value.trim();
  const reward = parseFloat(document.getElementById('adminTaskReward').value);
  const maxUsers = parseInt(document.getElementById('adminTaskMaxUsers').value || '0', 10);

  if (!title || !channelId || !link || isNaN(reward) || reward <= 0) {
    showToast('Please fill all required fields correctly.', 'error');
    return;
  }

  triggerHaptic('medium');
  try {
    const res = await fetch('/api/admin/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adminId: currentUser.id,
        adminUsername: currentUser.username || '',
        title,
        channel_id: channelId,
        channel_link: link,
        reward,
        max_users: maxUsers
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Task published successfully!', 'success');
      document.getElementById('adminTaskTitle').value = '';
      document.getElementById('adminTaskChannelId').value = '';
      document.getElementById('adminTaskLink').value = '';
      document.getElementById('adminTaskReward').value = '';
      document.getElementById('adminTaskMaxUsers').value = '0';
      loadAdminData();
      loadTasks();
    } else {
      showToast(data.error || 'Failed to create task', 'error');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Setup Event Listeners
function setupEventListeners() {
  // Tab Switching
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      switchTab(targetTab);
    });
  });

  // Home Quick Action Buttons
  const homeWithdrawBtn = document.getElementById('homeWithdrawBtn');
  if (homeWithdrawBtn) homeWithdrawBtn.addEventListener('click', () => switchTab('walletTab'));

  const homeTasksBtn = document.getElementById('homeTasksBtn');
  if (homeTasksBtn) homeTasksBtn.addEventListener('click', () => switchTab('tasksTab'));

  const homeGoAffiliateBtn = document.getElementById('homeGoAffiliateBtn');
  if (homeGoAffiliateBtn) homeGoAffiliateBtn.addEventListener('click', () => switchTab('affiliateTab'));

  // Copy User ID
  if (copyIdChip) {
    copyIdChip.addEventListener('click', () => {
      if (currentUser?.id) {
        navigator.clipboard.writeText(String(currentUser.id));
        triggerHaptic('light');
        showToast('User ID copied to clipboard!', 'success');
      }
    });
  }

  // Wallet Type Switcher (BDT vs USDT)
  if (tabBdtWalletBtn && tabUsdtWalletBtn) {
    tabBdtWalletBtn.addEventListener('click', () => {
      currentWalletType = 'BDT';
      tabBdtWalletBtn.classList.add('active-wallet-type');
      tabUsdtWalletBtn.classList.remove('active-wallet-type');
      bdtWalletSection.style.display = 'block';
      usdtWalletSection.style.display = 'none';
      triggerHaptic('light');
    });

    tabUsdtWalletBtn.addEventListener('click', () => {
      currentWalletType = 'USDT';
      tabUsdtWalletBtn.classList.add('active-wallet-type');
      tabBdtWalletBtn.classList.remove('active-wallet-type');
      usdtWalletSection.style.display = 'block';
      bdtWalletSection.style.display = 'none';
      triggerHaptic('light');
    });
  }

  // Open Add Wallet Modal (BDT and USDT)
  if (openAddBdtModalBtn) {
    openAddBdtModalBtn.addEventListener('click', () => openAddWalletModal('BDT'));
  }
  if (openAddUsdtModalBtn) {
    openAddUsdtModalBtn.addEventListener('click', () => openAddWalletModal('USDT'));
  }
  if (closeAddWalletModalBtn) {
    closeAddWalletModalBtn.addEventListener('click', closeAddWalletModal);
  }
  if (addWalletModalBackdrop) {
    addWalletModalBackdrop.addEventListener('click', (e) => {
      if (e.target === addWalletModalBackdrop) closeAddWalletModal();
    });
  }
  if (submitAddWalletBtn) {
    submitAddWalletBtn.addEventListener('click', submitAddNewWallet);
  }
  document.querySelectorAll('.provider-select-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      selectModalProvider(pill.getAttribute('data-provider'));
    });
  });

  // BDT Amount Chips
  document.querySelectorAll('.chip-btn[data-amt]').forEach(chip => {
    chip.addEventListener('click', () => {
      bdtAmountInput.value = chip.getAttribute('data-amt');
      triggerHaptic('light');
    });
  });

  const bdtMaxChip = document.getElementById('bdtMaxChip');
  if (bdtMaxChip) {
    bdtMaxChip.addEventListener('click', () => {
      if (currentUser?.balance) {
        bdtAmountInput.value = Math.floor(parseFloat(currentUser.balance));
        triggerHaptic('light');
      }
    });
  }

  // USDT Amount Chips & Live Calculation
  document.querySelectorAll('.chip-btn[data-usdt]').forEach(chip => {
    chip.addEventListener('click', () => {
      usdtAmountInput.value = chip.getAttribute('data-usdt');
      updateUsdtCostPreview();
      triggerHaptic('light');
    });
  });

  const usdtMaxChip = document.getElementById('usdtMaxChip');
  if (usdtMaxChip) {
    usdtMaxChip.addEventListener('click', () => {
      if (currentUser?.balance) {
        const maxUsdt = (parseFloat(currentUser.balance) / usdtRate).toFixed(2);
        usdtAmountInput.value = maxUsdt;
        updateUsdtCostPreview();
        triggerHaptic('light');
      }
    });
  }

  if (usdtAmountInput) {
    usdtAmountInput.addEventListener('input', updateUsdtCostPreview);
  }

  function updateUsdtCostPreview() {
    const val = parseFloat(usdtAmountInput.value || '0');
    if (!isNaN(val) && val > 0) {
      const cost = (val * usdtRate).toFixed(2);
      usdtCostPreview.innerHTML = `Deducts: <b>${cost} ৳</b> from your BDT wallet balance.`;
    } else {
      usdtCostPreview.innerHTML = `Deducts: <b>0.00 ৳</b> from your BDT wallet balance.`;
    }
  }

  // Submit Cashouts
  if (submitBdtWithdrawBtn) submitBdtWithdrawBtn.addEventListener('click', submitBdtWithdrawal);
  if (submitUsdtWithdrawBtn) submitUsdtWithdrawBtn.addEventListener('click', submitUsdtWithdrawal);

  // Copy Referral Link
  const copyRefBtn = document.getElementById('copyRefBtn');
  if (copyRefBtn) {
    copyRefBtn.addEventListener('click', () => {
      const input = document.getElementById('referralLinkInput');
      input.select();
      navigator.clipboard.writeText(input.value);
      triggerHaptic('light');
      showToast('Affiliate link copied!', 'success');
    });
  }

  // Share on Telegram
  const shareTelegramBtn = document.getElementById('shareTelegramBtn');
  if (shareTelegramBtn) {
    shareTelegramBtn.addEventListener('click', () => {
      const link = document.getElementById('referralLinkInput').value;
      const text = encodeURIComponent(`Join Telegram channels and earn daily cash rewards with instant payouts!\nStart earning today on TG BOOST:\n${link}`);
      window.open(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${text}`, '_blank');
      triggerHaptic('medium');
    });
  }

  // Admin Create Task
  const adminCreateTaskBtn = document.getElementById('adminCreateTaskBtn');
  if (adminCreateTaskBtn) adminCreateTaskBtn.addEventListener('click', submitAdminCreateTask);
}

// Switch Active Tab
function switchTab(tabId) {
  if (tabId === 'adminTab' && (!currentUser || !currentUser.isAdmin)) {
    showToast('Access Denied: Administrator privileges required.', 'error');
    return;
  }

  currentTab = tabId;
  triggerHaptic('light');

  // Update nav buttons
  document.querySelectorAll('.nav-item').forEach(btn => {
    if (btn.getAttribute('data-tab') === tabId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Update content sections
  document.querySelectorAll('.tab-content').forEach(sec => {
    if (sec.id === tabId) {
      sec.classList.add('active');
    } else {
      sec.classList.remove('active');
    }
  });

  // Load specific tab data
  if (tabId === 'tasksTab') loadTasks();
  if (tabId === 'walletTab') loadWithdrawalHistory();
  if (tabId === 'adminTab') loadAdminData();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Bootstrapping
window.addEventListener('DOMContentLoaded', () => {
  initTelegramTheme();
  const { tgUser, startParam } = initTelegramApp();
  setupEventListeners();
  loadUserData(tgUser, startParam);
});
