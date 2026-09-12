process.env.BOT_TOKEN = '123456789:ABCdefGHIjklMNOpqrSTUvwxYZ123456789';
const db = require('../src/database/db');
const { createBot } = require('../src/bot');

async function runTests() {
  console.log('🧪 Starting Automated Tests...\n');

  // 1. Test Database Init
  console.log('1️⃣ Testing Database Initialization...');
  await db.init();
  if (db.sqliteDb) {
    db.sqliteDb.exec('DELETE FROM user_tasks; DELETE FROM withdrawals; DELETE FROM tasks; DELETE FROM users;');
  }
  console.log('   ✅ DB initialized and cleaned.');

  // 2. Test User Creation & Referral
  console.log('2️⃣ Testing User Creation & Referral...');
  const refUser = await db.getOrCreateUser({
    id: 111111111,
    username: 'referrer_user',
    first_name: 'Referrer'
  });
  console.log('   ✅ Referrer created:', refUser.user.id);

  const newUser = await db.getOrCreateUser(
    {
      id: 222222222,
      username: 'test_member',
      first_name: 'Member'
    },
    111111111
  );
  console.log('   ✅ New user created with referrer:', newUser.user.id, 'referred_by:', newUser.user.referred_by);
  if (newUser.user.referred_by !== 111111111) {
    throw new Error('Referral ID mismatch!');
  }

  // 3. Test Task Creation
  console.log('3️⃣ Testing Task Creation...');
  const task = await db.addTask({
    title: 'অফিসিয়াল টেলিগ্রাম চ্যানেল',
    description: 'চ্যানেলে জয়েন করে ২.৫০ টাকা জিতে নিন',
    channel_id: '@test_channel',
    channel_link: 'https://t.me/test_channel',
    reward: 2.50,
    max_users: 100
  });
  console.log('   ✅ Task created:', task.id, task.title, 'Reward:', task.reward);

  // 4. Test Task Retrieval for User
  console.log('4️⃣ Testing Active Tasks Retrieval...');
  const availableTasks = await db.getActiveTasksForUser(222222222);
  console.log('   ✅ Available tasks count for user:', availableTasks.length);
  if (availableTasks.length === 0) throw new Error('Task should be available!');

  // 5. Test Task Completion & Reward Addition
  console.log('5️⃣ Testing Task Completion & Wallet Balance...');
  const completion = await db.completeTask(222222222, task.id);
  console.log('   ✅ Task completed! New balance:', completion.updatedUser.balance);
  if (parseFloat(completion.updatedUser.balance) !== 2.50) {
    throw new Error(`Expected balance 2.50, got ${completion.updatedUser.balance}`);
  }

  // Double completion prevention check
  const alreadyDone = await db.isTaskCompletedByUser(222222222, task.id);
  console.log('   ✅ User already completed check:', alreadyDone);
  if (!alreadyDone) throw new Error('isTaskCompletedByUser should be true!');

  // Check available tasks now - should be 0
  const remainingTasks = await db.getActiveTasksForUser(222222222);
  console.log('   ✅ Remaining tasks for user (should be 0):', remainingTasks.length);
  if (remainingTasks.length !== 0) throw new Error('Completed task should not appear!');

  // 6. Test Withdrawal System
  console.log('6️⃣ Testing Withdrawal Flow...');
  // Add more balance to test withdrawal
  await db.addBalance(222222222, 50.00, true);
  const userBeforeWithdraw = await db.getUser(222222222);
  console.log('   User balance before withdraw:', userBeforeWithdraw.balance);

  const withdraw = await db.createWithdrawal({
    userId: 222222222,
    amount: 30.00,
    method: 'bKash',
    accountNumber: '01712345678'
  });
  console.log('   ✅ Withdrawal created: ID #', withdraw.id, 'Status:', withdraw.status);

  const pendingWithdrawals = await db.getPendingWithdrawals();
  console.log('   ✅ Pending withdrawals count:', pendingWithdrawals.length);

  // Test approval
  await db.approveWithdrawal(withdraw.id, 'Test Approved');
  const approvedW = await db.getWithdrawal(withdraw.id);
  console.log('   ✅ Withdrawal approved. Status:', approvedW.status);

  // 7. Test Stats
  console.log('7️⃣ Testing Statistics...');
  const stats = await db.getStats();
  console.log('   ✅ Stats:', stats);

  // 8. Test Telegraf Bot Instantiation (with dummy token)
  console.log('8️⃣ Testing Telegraf Bot Creation...');
  const bot = createBot();
  if (!bot) throw new Error('Failed to create bot instance');
  console.log('   ✅ Telegraf bot instance created successfully.');

  console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! 🎉\n');
}

runTests().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
