# 🤖 TG BOOST - Telegram Task & Rewards Bot + Mini App

**TG BOOST** is a full-stack automated Telegram Task and Micro-earning platform. Users earn money (BDT) by joining verified Telegram channels and groups. The bot verifies channel membership in real-time using the official Telegram Bot API and credits the user's wallet upon verification. Users can easily withdraw their earnings to **bKash**, **Nagad**, or **Rocket**.

Includes both an automated **Telegram Bot** and a visual **Telegram Mini App (Web App)** with dark glassmorphic aesthetics.

---

## 🌟 Key Features

### 👤 For Members / Users:
- 📋 **Available Tasks Feed**: Browse active channel join tasks with real-time reward rates (e.g., +2.50 ৳).
- 🔍 **Real-Time Verification**: Instant Telegram Bot API membership verification via `getChatMember`.
- 💰 **Digital Wallet**: Real-time balance display, total earnings, and task completion metrics.
- 💳 **Direct Cashout**: Fast withdrawal to **bKash**, **Nagad**, and **Rocket** with customizable minimum limits.
- 👥 **Affiliate Program**: Personal referral link (`https://t.me/TgBoost_Monetizebot?start=ref_<USER_ID>`) with instant referral bonus.
- 📜 **Transaction History**: Real-time status tracking for all withdrawal requests (Pending, Approved, Rejected).
- 🔒 **Zero Admin Exposure**: Normal users never see admin options, buttons, or dashboards.

### ⚙️ For Administrators (`@TgBoost_Ajent`):
- 👑 **Protected Admin Panel**: Automatically unlocked **only** when accessed by authorized admin accounts.
- ➕ **Task Creation**: Add channel tasks with title, channel ID/username, link, reward amount, and member limit.
- 📋 **Task Management**: Pause, resume, or delete tasks at any time.
- 💸 **Cashout Queue**: 1-click **Approve** (with automated payout notification to user) or **Reject** (with balance refund).
- 📊 **Live Analytics**: Real-time metrics for total members, active channels, completed tasks, and total payouts.
- 📢 **Broadcast Engine**: Instant message announcements to all bot members.

---

## 📁 Project Architecture

```
tgbost/
├── public/
│   ├── index.html         # Telegram Mini App (100% English, Glassmorphic UI)
│   ├── style.css          # Modern dark CSS design system
│   └── app.js             # Telegram WebApp SDK, Confetti, Haptic feedback
├── src/
│   ├── config.js          # Configuration & Admin access verification
│   ├── index.js           # Server bootstrap & Express static/API server
│   ├── bot.js             # Telegraf bot instance & event routing
│   ├── database/
│   │   └── db.js          # Dual database adapter (SQLite & PostgreSQL)
│   ├── keyboards/
│   │   └── mainKeyboard.js# English Telegram reply keyboards
│   ├── api/
│   │   └── routes.js      # REST API router for Mini App
│   └── handlers/
│       ├── start.js       # Start command & referral attribution
│       ├── tasks.js       # Task feed & Telegram membership verification
│       ├── wallet.js      # Wallet balance & withdrawal workflow
│       ├── referral.js    # Referral tracking & sharing
│       ├── admin.js       # Admin panel & withdrawal disbursement
│       └── help.js        # Rules and guidelines
├── api/
│   └── index.js           # Vercel serverless integration
├── vercel.json            # Vercel deployment & routing configuration
├── .env                   # Bot token and admin configuration
└── package.json           # Scripts and dependencies
```

---

## 🚀 Getting Started

### 1. Configuration (`.env`)
Make sure your `.env` file contains your Bot credentials:
```env
BOT_TOKEN=8813841499:AAGqmTansq_V3dYISP6FjEFmQgwhZPtZYA8
ADMIN_IDS=TgBoost_Ajent
MIN_WITHDRAW=20
REFERRAL_REWARD=1.0
CURRENCY=৳
PORT=3000
```

### 2. Add Bot as Admin to Target Channels
To verify that members join your channel or group:
1. Open your target Telegram channel/group.
2. Go to **Channel Settings > Administrators > Add Administrator**.
3. Search for `@TgBoost_Monetizebot` and grant admin rights (specifically **Invite Users / View Members**).
4. Go to `/admin` or the Admin tab in the Mini App and publish the task.

### 3. Run Locally
```bash
npm install
npm start
```
The server will be live at `http://localhost:3000`.

---

## 🌐 24/7 Lifetime Free Hosting on Vercel

### Step 1: Push to GitHub
```bash
git init
git add .
git commit -m "TG Boost Bot and Mini App"
git branch -M main
git remote add origin https://github.com/your-username/tgboost.git
git push -u origin main
```

### Step 2: Import into Vercel
1. Log in to [Vercel.com](https://vercel.com) and click **Add New Project**.
2. Select your GitHub repository.
3. In **Environment Variables**, add:
   - `BOT_TOKEN` = `8813841499:AAGqmTansq_V3dYISP6FjEFmQgwhZPtZYA8`
   - `ADMIN_IDS` = `TgBoost_Ajent`
   - `DATABASE_URL` = (Your free PostgreSQL URI from Supabase or Neon)
4. Click **Deploy**. Vercel will provide a free HTTPS URL (e.g., `https://tgboost.vercel.app`).

### Step 3: Link to Telegram Webhook & Menu Button
1. **Set Telegram Webhook:**
   Open this URL in your web browser:
   ```
   https://api.telegram.org/bot8813841499:AAGqmTansq_V3dYISP6FjEFmQgwhZPtZYA8/setWebhook?url=https://YOUR-APP.vercel.app/webhook
   ```
2. **Set Menu Button in @BotFather:**
   - In Telegram, open [@BotFather](https://t.me/BotFather).
   - Send `/mybots` > choose `@TgBoost_Monetizebot` > **Bot Settings** > **Menu Button** > **Configure menu button**.
   - Enter your Vercel URL: `https://YOUR-APP.vercel.app`.

Now your Telegram Mini App and Bot will run 24/7 for lifetime without any server costs!
