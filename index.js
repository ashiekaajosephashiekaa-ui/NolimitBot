// ============================================================
// NooLimit Bot — pure Telegram bot (long polling)
// Bot: @NoolimitsBot
// Host: Railway
// ============================================================

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID || '';
const BOT_USERNAME = 'NoolimitsBot';
const APP_NAME = 'NooLimit';

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN env var is required');
  process.exit(1);
}

// ============================================================
// STORAGE — in-memory (Railway keeps process alive 24/7)
// ============================================================
const USERS = new Map();
function getUser(id) { return USERS.get(String(id)) || null; }
function saveUser(id, u) { USERS.set(String(id), u); return u; }
function allUserIds() { return [...USERS.keys()]; }

function newUser(p) {
  return {
    id: p.id, username: p.username || '', first_name: p.first_name || '',
    balance: 0, level: 1, xp: 0,
    referrals: 0, referredBy: null,
    tasks: {}, started: {}, createdAt: Date.now(),
  };
}
function getOrCreate(p) {
  let u = getUser(p.id);
  if (!u) { u = newUser(p); saveUser(p.id, u); }
  return u;
}

// ============================================================
// FEATURES + TASKS
// ============================================================
const FEATURES = [
  { id: 'daily',   icon: '📅', title: 'Daily Tasks'    },
  { id: 'timers',  icon: '⏱️', title: 'Timed Rewards'  },
  { id: 'quick',   icon: '⚡', title: 'Quick Wins'     },
  { id: 'ads',     icon: '🎬', title: 'Bonus Ads'      },
  { id: 'invite',  icon: '🎁', title: 'Invite Friends' },
  { id: 'profile', icon: '👤', title: 'My Profile'     },
];

const TASKS = [
  // DAILY
  { id: 'd_checkin', cat: 'daily', icon: '✅', title: 'Daily Check-in',  reward: 15, type: 'instant', daily: true },
  { id: 'd_open',    cat: 'daily', icon: '🚀', title: 'Open the Bot',    reward: 5,  type: 'instant', daily: true },
  { id: 'd_wait',    cat: 'daily', icon: '👀', title: 'Wait 30 seconds', reward: 10, type: 'timer', seconds: 30, daily: true },

  // TIMERS
  { id: 'tm_30',  cat: 'timers', icon: '⏱️', title: 'Wait 30 seconds', reward: 25,  type: 'timer', seconds: 30 },
  { id: 'tm_60',  cat: 'timers', icon: '⏳', title: 'Wait 60 seconds', reward: 50,  type: 'timer', seconds: 60 },
  { id: 'tm_120', cat: 'timers', icon: '🕐', title: 'Wait 2 minutes',  reward: 100, type: 'timer', seconds: 120 },

  // QUICK WINS
  { id: 'qw_about', cat: 'quick', icon: '📖', title: 'Read About',    reward: 20, type: 'link', url: 'https://t.me/' + BOT_USERNAME, wait: 5 },
  { id: 'qw_web',   cat: 'quick', icon: '🌐', title: 'Visit website', reward: 25, type: 'link', url: 'https://telegram.org', wait: 5 },
  { id: 'qw_share', cat: 'quick', icon: '📤', title: 'Share bot',     reward: 30, type: 'instant', daily: true },
  { id: 'qw_rate',  cat: 'quick', icon: '⭐', title: 'Rate the bot',  reward: 35, type: 'instant', daily: true },

  // ADS (rewarded)
  { id: 'ad_1', cat: 'ads', icon: '🎬', title: 'Bonus Ad', reward: 25, type: 'cooldown', cooldown: 90 },
  { id: 'ad_2', cat: 'ads', icon: '🎥', title: 'Extra Ad', reward: 25, type: 'cooldown', cooldown: 180 },
];

// ============================================================
// HELPERS
// ============================================================
function taskStatus(user, t) {
  const s = user.tasks[t.id] || { count: 0, lastAt: 0 };
  const now = Date.now();
  const DAY = 86400000;

  if ((t.type === 'instant' || t.type === 'timer') && t.daily) {
    const elapsed = now - (s.lastAt || 0);
    const ready = elapsed >= DAY;
    return { done: false, ready, nextAt: ready ? 0 : s.lastAt + DAY };
  }
  if (t.type === 'timer' || t.type === 'link' || t.type === 'instant') {
    const done = s.count > 0;
    return { done, ready: !done, nextAt: 0 };
  }
  if (t.type === 'cooldown') {
    const cd = (t.cooldown || 60) * 1000;
    const elapsed = now - (s.lastAt || 0);
    const ready = elapsed >= cd;
    return { done: false, ready, nextAt: ready ? 0 : s.lastAt + cd };
  }
  return { done: false, ready: true, nextAt: 0 };
}

function creditTask(user, task) {
  const now = Date.now();
  const cur = user.tasks[task.id] || { count: 0, lastAt: 0 };
  cur.count += 1;
  cur.lastAt = now;
  user.tasks[task.id] = cur;
  user.balance += task.reward;
  user.xp += task.reward;
  user.level = Math.floor(user.xp / 500) + 1;
  return task.reward;
}

function fmtTime(ms) {
  if (ms <= 0) return 'now';
  const s = Math.ceil(ms / 1000);
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60), rem = s % 60;
  if (m < 60) return m + 'm ' + rem + 's';
  const h = Math.floor(m / 60);
  return h + 'h ' + (m % 60) + 'm';
}

// ============================================================
// TELEGRAM API
// ============================================================
async function tg(method, payload) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const j = await res.json();
    if (!j.ok) console.error('tg error:', method, j.description);
    return j;
  } catch (e) {
    console.error('tg network error:', e.message);
    return { ok: false };
  }
}

// ============================================================
// MENUS
// ============================================================
function welcomeText(user) {
  return `👋 *Welcome to ${APP_NAME}*, ${user.first_name}!\n\n` +
    `💠 *6 ways to earn NL:*\n` +
    `📅  Daily Tasks — reset every 24h\n` +
    `⏱️  Timed Rewards — wait to earn\n` +
    `⚡  Quick Wins — fast NL\n` +
    `🎬  Bonus Ads — optional\n` +
    `🎁  Invite Friends — unlimited\n` +
    `👤  My Profile — track progress\n\n` +
    `💰 Balance: *${user.balance} NL*\n` +
    `🏆 Level: *${user.level}*\n\n` +
    `_NL has no cash value. Entertainment only._`;
}

function mainMenu() {
  return {
    inline_keyboard: [
      [{ text: '📅 Daily Tasks', callback_data: 'cat:daily' }, { text: '⏱️ Timed Rewards', callback_data: 'cat:timers' }],
      [{ text: '⚡ Quick Wins', callback_data: 'cat:quick' }, { text: '🎬 Bonus Ads', callback_data: 'cat:ads' }],
      [{ text: '🎁 Invite Friends', callback_data: 'cat:invite' }, { text: '👤 My Profile', callback_data: 'cat:profile' }],
      [{ text: '🔄 Refresh Balance', callback_data: 'balance' }],
    ],
  };
}

function categoryHeader(cat) {
  const f = FEATURES.find(x => x.id === cat);
  return `${f.icon} *${f.title}*\n\nTap any task below to start earning NL.`;
}

function categoryMenu(user, cat) {
  const tasks = TASKS.filter(t => t.cat === cat);
  const rows = [];
  tasks.forEach(t => {
    const s = taskStatus(user, t);
    const started = user.started?.[t.id];
    let label, cb;

    if (s.done) {
      label = `✅ ${t.title}`;
      cb = 'noop';
    } else if (!s.ready) {
      label = `⏳ ${t.title} — ${fmtTime(s.nextAt - Date.now())}`;
      cb = 'noop';
    } else if ((t.type === 'timer' || t.type === 'link') && started) {
      const elapsed = (Date.now() - started) / 1000;
      const req = t.seconds || t.wait || 5;
      if (elapsed < req) {
        label = `⏳ ${t.title} — ${Math.ceil(req - elapsed)}s left`;
      } else {
        label = `✅ Claim ${t.title} — +${t.reward} NL`;
      }
      cb = `task:${t.id}`;
    } else {
      label = `${t.icon} ${t.title} — +${t.reward} NL`;
      cb = `task:${t.id}`;
    }
    rows.push([{ text: label, callback_data: cb }]);
  });
  rows.push([{ text: '← Back', callback_data: 'menu' }]);
  return { inline_keyboard: rows };
}

function profileText(user) {
  const total = Object.values(user.tasks || {}).reduce((a, t) => a + (t.count || 0), 0);
  return `👤 *Your Profile*\n\n` +
    `• Name: *${user.first_name || '—'}*\n` +
    `• Username: ${user.username ? '@' + user.username : '_not set_'}\n` +
    `• Balance: *${user.balance} NL*\n` +
    `• Level: *${user.level}*\n` +
    `• XP: *${user.xp}*\n` +
    `• Referrals: *${user.referrals || 0}*\n` +
    `• Tasks completed: *${total}*\n\n` +
    `_NL is an in-app token with no monetary value._`;
}

function inviteText(user) {
  const link = `https://t.me/${BOT_USERNAME}?start=ref_${user.id}`;
  return `🎁 *Invite Friends — unlimited*\n\n` +
    `Share your invite link. You get *+50 NL* for every friend who joins.\n\n` +
    `Your link:\n\`${link}\`\n\n` +
    `_No cap. No limit._`;
}

function inviteMenu(user) {
  const link = `https://t.me/${BOT_USERNAME}?start=ref_${user.id}`;
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('Join NooLimit and earn NL! 🚀')}`;
  return {
    inline_keyboard: [
      [{ text: '📤 Share on Telegram', url: shareUrl }],
      [{ text: '📋 Copy link', callback_data: 'copy_link' }],
      [{ text: '← Back', callback_data: 'menu' }],
    ],
  };
}

// ============================================================
// COMMAND HANDLER
// ============================================================
async function handleCommand(cmd, msg, user, fullText) {
  const chatId = msg.chat.id;

  if (cmd === '/start') {
    const ref = fullText.match(/ref_(\d+)/);
    if (ref && !user.referredBy && Number(ref[1]) !== user.id) {
      const r = getUser(Number(ref[1]));
      if (r) {
        r.balance += 50;
        r.referrals = (r.referrals || 0) + 1;
        saveUser(r.id, r);
        user.referredBy = r.id;
        user.balance += 25;
        saveUser(user.id, user);
        tg('sendMessage', { chat_id: r.id, text: '🎉 New referral! +50 NL' });
      }
    }
    return tg('sendMessage', {
      chat_id: chatId,
      text: welcomeText(user),
      parse_mode: 'Markdown',
      reply_markup: mainMenu(),
    });
  }

  if (cmd === '/menu' || cmd === '/tasks') {
    return tg('sendMessage', {
      chat_id: chatId,
      text: welcomeText(user),
      parse_mode: 'Markdown',
      reply_markup: mainMenu(),
    });
  }

  if (cmd === '/balance') {
    return tg('sendMessage', {
      chat_id: chatId,
      text: `💰 *Balance:* ${user.balance} NL\n🏆 *Level:* ${user.level}\n⚡ *XP:* ${user.xp}`,
      parse_mode: 'Markdown',
      reply_markup: mainMenu(),
    });
  }

  if (cmd === '/invite') {
    return tg('sendMessage', {
      chat_id: chatId,
      text: inviteText(user),
      parse_mode: 'Markdown',
      reply_markup: inviteMenu(user),
    });
  }

  if (cmd === '/profile') {
    return tg('sendMessage', {
      chat_id: chatId,
      text: profileText(user),
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: '← Menu', callback_data: 'menu' }]] },
    });
  }

  if (cmd === '/help') {
    return tg('sendMessage', {
      chat_id: chatId,
      text:
        `*${APP_NAME} Commands*\n\n` +
        `/start – Register\n/menu – Main menu\n/balance – Balance\n` +
        `/invite – Invite link\n/profile – Profile\n` +
        `/privacy – Privacy policy\n/terms – Terms of use\n/help – This menu\n\n` +
        `_NL has no monetary value._`,
      parse_mode: 'Markdown',
      reply_markup: mainMenu(),
    });
  }

  if (cmd === '/privacy') {
    return tg('sendMessage', {
      chat_id: chatId,
      text:
        `🔒 *Privacy Policy*\n\n` +
        `We store:\n• Your Telegram user ID\n• Your username & first name\n• Your in-app progress (balance, level, tasks)\n\n` +
        `We do NOT store:\n• Messages or contacts\n• Payment information\n• Location or personal data\n\n` +
        `Data is kept only inside this bot and is never shared with third parties.\n\n` +
        `_Entertainment only. NL has no cash value._`,
      parse_mode: 'Markdown',
    });
  }

  if (cmd === '/terms') {
    return tg('sendMessage', {
      chat_id: chatId,
      text:
        `📜 *Terms of Use*\n\n` +
        `• ${APP_NAME} is an entertainment bot.\n` +
        `• "NL" is a virtual in-app token with *no monetary value*.\n` +
        `• NL cannot be withdrawn, sold, traded, or exchanged.\n` +
        `• No gambling, betting, or real-money mechanics exist.\n` +
        `• Rewarded ads are always optional.\n` +
        `• Abuse or automation leads to a ban.\n\n` +
        `By using this bot you accept these terms.`,
      parse_mode: 'Markdown',
    });
  }

  if (cmd === '/stats' && String(user.id) === ADMIN_ID) {
    return tg('sendMessage', { chat_id: chatId, text: `📊 Users: ${USERS.size}` });
  }

  if (cmd === '/broadcast' && String(user.id) === ADMIN_ID) {
    const m = fullText.replace('/broadcast', '').trim();
    if (!m) return tg('sendMessage', { chat_id: chatId, text: 'Usage: /broadcast <msg>' });
    let sent = 0;
    const ids = allUserIds();
    for (const id of ids) {
      try { await tg('sendMessage', { chat_id: id, text: m }); sent++; } catch {}
      await new Promise(r => setTimeout(r, 40));
    }
    return tg('sendMessage', { chat_id: chatId, text: `📢 Sent to ${sent}/${ids.length}` });
  }
}

// ============================================================
// CALLBACK HANDLER
// ============================================================
async function handleCallback(q, user, data) {
  const chatId = q.message.chat.id;
  const msgId = q.message.message_id;

  const answer = (text, alert = false) => tg('answerCallbackQuery', {
    callback_query_id: q.id,
    text: text || undefined,
    show_alert: alert,
  });

  const safeEdit = async (text, markup) => {
    const r = await tg('editMessageText', {
      chat_id: chatId, message_id: msgId,
      text, parse_mode: 'Markdown', reply_markup: markup,
    });
    if (!r.ok && r.description && !r.description.includes('not modified')) {
      await tg('sendMessage', { chat_id: chatId, text, parse_mode: 'Markdown', reply_markup: markup });
    }
  };

  if (data === 'noop') return answer();

  if (data === 'menu') {
    await safeEdit(welcomeText(user), mainMenu());
    return answer();
  }

  if (data === 'balance') {
    return answer(`💰 Balance: ${user.balance} NL · Lv ${user.level}`, true);
  }

  if (data === 'copy_link') {
    const link = `https://t.me/${BOT_USERNAME}?start=ref_${user.id}`;
    return answer(link, true);
  }

  // Category
  if (data.startsWith('cat:')) {
    const cat = data.slice(4);

    if (cat === 'invite') {
      await safeEdit(inviteText(user), inviteMenu(user));
      return answer();
    }
    if (cat === 'profile') {
      await safeEdit(profileText(user), { inline_keyboard: [[{ text: '← Back', callback_data: 'menu' }]] });
      return answer();
    }
    await safeEdit(categoryHeader(cat), categoryMenu(user, cat));
    return answer();
  }

  // Task
  if (data.startsWith('task:')) {
    const taskId = data.slice(5);
    const task = TASKS.find(t => t.id === taskId);
    if (!task) return answer('Task not found', true);

    const s = taskStatus(user, task);
    if (!s.ready) return answer(`⏳ Ready in ${fmtTime(s.nextAt - Date.now())}`, true);

    // Instant / cooldown
    if (task.type === 'instant' || task.type === 'cooldown') {
      const reward = creditTask(user, task);
      saveUser(user.id, user);
      await safeEdit(
        categoryHeader(task.cat) + `\n\n✅ _You earned +${reward} NL!_`,
        categoryMenu(user, task.cat)
      );
      return answer(`+${reward} NL credited!`);
    }

    // Timer / link
    if (task.type === 'timer' || task.type === 'link') {
      const started = user.started?.[taskId];

      if (!started) {
        user.started = user.started || {};
        user.started[taskId] = Date.now();
        saveUser(user.id, user);

        if (task.type === 'link') {
          await tg('sendMessage', {
            chat_id: chatId,
            text: `🔗 *${task.title}*\n\nTap below to open the link. After viewing, come back to the bot and tap *${task.title}* again to claim *+${task.reward} NL*.`,
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: '🌐 Open Link', url: task.url }]] },
          });
        } else {
          await tg('sendMessage', {
            chat_id: chatId,
            text: `⏱️ *${task.title}*\n\nTimer started. Wait *${task.seconds} seconds*, then tap *${task.title}* again to claim *+${task.reward} NL*.`,
            parse_mode: 'Markdown',
          });
        }

        await safeEdit(categoryHeader(task.cat), categoryMenu(user, task.cat));
        return answer(task.type === 'link' ? 'Link opened!' : 'Timer started!');
      }

      const elapsed = (Date.now() - started) / 1000;
      const req = task.seconds || task.wait || 5;
      if (elapsed < req) {
        return answer(`⏳ ${Math.ceil(req - elapsed)}s remaining`, true);
      }

      delete user.started[taskId];
      const reward = creditTask(user, task);
      saveUser(user.id, user);
      await safeEdit(
        categoryHeader(task.cat) + `\n\n✅ _You earned +${reward} NL!_`,
        categoryMenu(user, task.cat)
      );
      return answer(`+${reward} NL credited!`);
    }

    return answer('Unknown task type', true);
  }

  return answer();
}

// ============================================================
// UPDATE DISPATCHER
// ============================================================
async function handleUpdate(update) {
  try {
    if (update.message) {
      const msg = update.message;
      const from = msg.from;
      if (!from) return;
      const text = (msg.text || '').trim();
      if (!text.startsWith('/')) return;
      const user = getOrCreate(from);
      const cmd = text.split(' ')[0].toLowerCase().split('@')[0];
      return handleCommand(cmd, msg, user, text);
    }

    if (update.callback_query) {
      const q = update.callback_query;
      const from = q.from;
      if (!from) return;
      const user = getOrCreate(from);
      return handleCallback(q, user, q.data || '');
    }
  } catch (e) {
    console.error('handleUpdate error:', e);
  }
}

// ============================================================
// POLLING LOOP
// ============================================================
let polling = true;

async function poll() {
  console.log(`🤖 ${APP_NAME} bot starting…`);

  // Clear any existing webhook so polling works
  await tg('deleteWebhook', { drop_pending_updates: false });

  // Confirm bot identity
  const me = await tg('getMe', {});
  if (me.ok) {
    console.log(`✅ Logged in as @${me.result.username}`);
  } else {
    console.error('❌ Bot token invalid');
    process.exit(1);
  }

  let offset = 0;
  while (polling) {
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${offset}&timeout=30`
      );
      const data = await res.json();

      if (data.ok && Array.isArray(data.result)) {
        for (const update of data.result) {
          offset = update.update_id + 1;
          // Run in background so long tasks don't block
          handleUpdate(update).catch(e => console.error('update error:', e));
        }
      } else if (!data.ok) {
        console.error('getUpdates error:', data.description);
        await new Promise(r => setTimeout(r, 3000));
      }
    } catch (e) {
      console.error('poll network error:', e.message);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

process.on('SIGINT', () => { polling = false; process.exit(0); });
process.on('SIGTERM', () => { polling = false; process.exit(0); });

poll();
