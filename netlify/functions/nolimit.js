// ============================================================
// NooLimit — Telegram Mini App + Bot with unlimited tasks
// Bot: @NoolimitsBot
// ============================================================

const crypto = require('crypto');

const APP_NAME = 'NooLimit';
const LOGO_URL = 'https://iili.io/nuLWzp2.jpg';
const BOT_USERNAME = 'NoolimitsBot';
const BRAND_DARK = '#0b0e14';

// ---------- Storage (in-memory — resets on cold start) ----------
const USERS = new Map();
function getUser(id) { return USERS.get(String(id)) || null; }
function saveUser(id, u) { USERS.set(String(id), u); return u; }

function newUser(p) {
  return {
    id: p.id, username: p.username || '', first_name: p.first_name || '',
    balance: 0, level: 1, xp: 0,
    referrals: 0, referredBy: null,
    tasks: {},            // { taskId: { count, lastAt } }
    lastDaily: 0, streak: 0,
    createdAt: Date.now(),
  };
}
function createUser(p) {
  return getUser(p.id) || saveUser(p.id, newUser(p));
}

// ============================================================
// TASKS — add as many as you want
// type: 'once' | 'daily' | 'cooldown' | 'unlimited'
// ============================================================
const TASKS = [
  // ---------- ONE-TIME ----------
  { id: 'follow_x',    type: 'once', reward: 30, title: 'Follow us on X',      desc: 'Open our X profile and follow.',        icon: '🐦', url: 'https://x.com/' },
  { id: 'join_chan',   type: 'once', reward: 40, title: 'Join our channel',    desc: 'Join the announcement channel.',        icon: '📢', url: 'https://t.me/' },
  { id: 'visit_site',  type: 'once', reward: 20, title: 'Visit our website',   desc: 'Open our site and look around.',        icon: '🌐', url: 'https://t.me/' },
  { id: 'read_about',  type: 'once', reward: 15, title: 'Read About page',     desc: 'Open About and read the policy.',       icon: '📖' },
  { id: 'rate_bot',    type: 'once', reward: 25, title: 'Rate the bot',        desc: 'Send us your feedback via the bot.',    icon: '⭐' },
  { id: 'enable_notif',type: 'once', reward: 20, title: 'Enable notifications',desc: 'Turn on alerts to catch new rewards.',  icon: '🔔' },
  { id: 'complete_prof',type:'once', reward: 15, title: 'Complete your profile',desc:'Add a username in Telegram settings.', icon: '👤' },
  { id: 'first_share', type: 'once', reward: 35, title: 'Share NooLimit once', desc: 'Share the bot with a friend.',          icon: '📤' },

  // ---------- DAILY (reset every 24h) ----------
  { id: 'd_checkin',   type: 'daily', reward: 10, title: 'Daily check-in',      desc: 'Claim a small reward every day.',       icon: '📅' },
  { id: 'd_open_app',  type: 'daily', reward: 5,  title: 'Open the app',        desc: 'Just open NooLimit once a day.',        icon: '🚀' },
  { id: 'd_3ads',      type: 'daily', reward: 45, title: 'Watch 3 bonus ads',   desc: 'Watch any 3 bonus ads today.',          icon: '🎬' },
  { id: 'd_read_board',type: 'daily', reward: 15, title: 'Check leaderboard',   desc: 'Open the leaderboard tab.',             icon: '🏆' },
  { id: 'd_send_msg',  type: 'daily', reward: 10, title: 'Send a message',      desc: 'Send any command to the bot.',          icon: '💬' },
  { id: 'd_browse',    type: 'daily', reward: 8,  title: 'Browse for 30s',      desc: 'Keep the app open 30 seconds.',         icon: '⏱️' },

  // ---------- COOLDOWN (repeatable with timer) ----------
  { id: 'c_ad',        type: 'cooldown', cooldown: 90,    reward: 25, title: 'Watch a bonus ad',     desc: 'Earn NL for watching a short ad.',  icon: '🎬' },
  { id: 'c_stay30',    type: 'cooldown', cooldown: 300,   reward: 15, title: 'Stay 30 seconds',      desc: 'Keep the app open for 30s.',        icon: '⏱️' },
  { id: 'c_stay60',    type: 'cooldown', cooldown: 600,   reward: 30, title: 'Stay 60 seconds',      desc: 'Keep the app open for 60s.',        icon: '⏳' },
  { id: 'c_click',     type: 'cooldown', cooldown: 180,   reward: 10, title: 'Quick tap challenge',  desc: 'Tap to claim a small reward.',      icon: '👆' },
  { id: 'c_support',   type: 'cooldown', cooldown: 900,   reward: 20, title: 'Support us',           desc: 'Share or invite to earn NL.',       icon: '💚' },
  { id: 'c_daily_roll',type: 'cooldown', cooldown: 3600,  reward: 12, title: 'Hourly bonus',         desc: 'Claim once per hour.',              icon: '⌛' },
  { id: 'c_visit_p',   type: 'cooldown', cooldown: 600,   reward: 18, title: 'Visit partner site',   desc: 'Open our partner and come back.',   icon: '🔗', url: 'https://t.me/' },

  // ---------- UNLIMITED (soft per-hour limit) ----------
  { id: 'u_invite',    type: 'unlimited', hourly: 20, reward: 50, title: 'Invite a friend',      desc: 'Get 50 NL when a friend joins.',    icon: '🎁' },
  { id: 'u_share',     type: 'unlimited', hourly: 5,  reward: 20, title: 'Share NooLimit',       desc: 'Share the bot link anywhere.',      icon: '📤' },
  { id: 'u_post',      type: 'unlimited', hourly: 3,  reward: 15, title: 'Post in channel',      desc: 'Post in the community channel.',    icon: '📝' },
  { id: 'u_tap',       type: 'unlimited', hourly: 60, reward: 1,  title: 'Tap for 1 NL',         desc: 'Tiny reward, 60x per hour.',        icon: '👊' },
];

// ---------- Telegram helpers ----------
function tgUrl(m) { return `https://api.telegram.org/bot${process.env.BOT_TOKEN}/${m}`; }
async function tg(method, payload) {
  try {
    const r = await fetch(tgUrl(method), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return r.json();
  } catch (e) { console.error(e); return { ok: false }; }
}

function verifyInitData(initData, botToken) {
  try {
    const p = new URLSearchParams(initData);
    const hash = p.get('hash');
    if (!hash) return null;
    p.delete('hash');
    const dcs = [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
    const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const computed = crypto.createHmac('sha256', secret).update(dcs).digest('hex');
    if (computed !== hash) return null;
    const authDate = Number(p.get('auth_date') || 0);
    if (Math.floor(Date.now() / 1000) - authDate > 86400) return null;
    return JSON.parse(p.get('user') || 'null');
  } catch { return null; }
}

function publicUser(u) {
  return {
    id: u.id, username: u.username, first_name: u.first_name,
    balance: u.balance, level: u.level, xp: u.xp,
    referrals: u.referrals, streak: u.streak, tasks: u.tasks,
  };
}

// Determine if a task is currently available + time until next
function taskStatus(user, task) {
  const s = user.tasks[task.id] || { count: 0, lastAt: 0 };
  const now = Date.now();

  if (task.type === 'once') {
    return { done: s.count > 0, ready: s.count === 0, nextAt: 0 };
  }
  if (task.type === 'daily') {
    const DAY = 86400000;
    const elapsed = now - (s.lastAt || 0);
    const ready = elapsed >= DAY;
    return { done: false, ready, nextAt: ready ? 0 : (s.lastAt + DAY) };
  }
  if (task.type === 'cooldown') {
    const cd = (task.cooldown || 60) * 1000;
    const elapsed = now - (s.lastAt || 0);
    const ready = elapsed >= cd;
    return { done: false, ready, nextAt: ready ? 0 : (s.lastAt + cd) };
  }
  if (task.type === 'unlimited') {
    // soft hourly rate limit
    const hourAgo = now - 3600000;
    const recent = (s.recent || []).filter(t => t > hourAgo);
    const ready = recent.length < (task.hourly || 10);
    return { done: false, ready, nextAt: ready ? 0 : (recent[0] + 3600000) };
  }
  return { done: false, ready: true, nextAt: 0 };
}

// ============================================================
// BOT HANDLER
// ============================================================
async function handleBot(update) {
  const msg = update.message || update.callback_query?.message;
  const from = update.message?.from || update.callback_query?.from;
  if (!msg || !from) return;

  const chatId = msg.chat.id;
  const text = (update.message?.text || '').trim();
  const cmd = text.split(' ')[0].toLowerCase();
  const WEBAPP_URL = process.env.WEBAPP_URL || `https://${BOT_USERNAME.toLowerCase()}.netlify.app`;
  const user = createUser(from);

  const launchBtn = {
    inline_keyboard: [[{ text: `🚀 Launch ${APP_NAME}`, web_app: { url: WEBAPP_URL } }]],
  };

  if (cmd === '/start') {
    const ref = text.match(/ref_(\d+)/);
    if (ref && !user.referredBy && Number(ref[1]) !== from.id) {
      const r = getUser(Number(ref[1]));
      if (r) {
        r.balance += 50; r.referrals += 1; saveUser(r.id, r);
        user.referredBy = r.id; user.balance += 25; saveUser(user.id, user);
        tg('sendMessage', { chat_id: r.id, text: '🎉 New referral! +50 NL' });
      }
    }
    return tg('sendMessage', {
      chat_id: chatId,
      text:
        `👋 Welcome to *${APP_NAME}*, ${from.first_name}!\n\n` +
        `Open the Mini App to see all tasks, bonuses, and rewards.\n\n` +
        `_Points have no cash value — entertainment only._`,
      parse_mode: 'Markdown',
      reply_markup: launchBtn,
    });
  }

  if (cmd === '/balance') {
    return tg('sendMessage', {
      chat_id: chatId,
      text: `💰 Balance: *${user.balance} NL*\n🏆 Level: ${user.level}\n⚡ XP: ${user.xp}`,
      parse_mode: 'Markdown',
      reply_markup: launchBtn,
    });
  }

  if (cmd === '/daily') {
    const now = Date.now(), DAY = 86400000;
    if (now - user.lastDaily < DAY) {
      const h = Math.ceil((DAY - (now - user.lastDaily)) / 3600000);
      return tg('sendMessage', { chat_id: chatId, text: `⏳ Come back in ~${h}h.` });
    }
    user.streak = now - user.lastDaily < DAY * 2 ? user.streak + 1 : 1;
    user.lastDaily = now;
    const reward = 10 + user.streak * 5;
    user.balance += reward;
    saveUser(user.id, user);
    return tg('sendMessage', {
      chat_id: chatId,
      text: `✅ Daily claimed! +${reward} NL\n🔥 Streak: ${user.streak}`,
    });
  }

  if (cmd === '/invite') {
    const link = `https://t.me/${BOT_USERNAME}?start=ref_${from.id}`;
    return tg('sendMessage', {
      chat_id: chatId,
      text: `🎁 *Your invite link:*\n\`${link}\`\n\n+50 NL per friend (unlimited).`,
      parse_mode: 'Markdown',
    });
  }

  if (cmd === '/help') {
    return tg('sendMessage', {
      chat_id: chatId,
      text:
        `*${APP_NAME} Commands*\n\n` +
        `/start – Register\n/balance – Balance\n/daily – Daily reward\n` +
        `/invite – Referral link\n/tasks – Open app\n/help – Menu\n\n` +
        `NL is an in-app token with no monetary value.`,
      parse_mode: 'Markdown',
      reply_markup: launchBtn,
    });
  }

  if (cmd === '/tasks') {
    return tg('sendMessage', { chat_id: chatId, text: '🎯 Open the Mini App:', reply_markup: launchBtn });
  }

  if (cmd === '/admin' && String(from.id) === process.env.ADMIN_ID) {
    return tg('sendMessage', {
      chat_id: chatId,
      text: `*Admin*\n/broadcast <msg>\n/stats`,
      parse_mode: 'Markdown',
    });
  }

  if (cmd === '/stats' && String(from.id) === process.env.ADMIN_ID) {
    return tg('sendMessage', { chat_id: chatId, text: `📊 Users: ${USERS.size}` });
  }

  if (cmd === '/broadcast' && String(from.id) === process.env.ADMIN_ID) {
    const m = text.replace('/broadcast', '').trim();
    if (!m) return tg('sendMessage', { chat_id: chatId, text: 'Usage: /broadcast <msg>' });
    let sent = 0;
    for (const u of USERS.values()) {
      try { await tg('sendMessage', { chat_id: u.id, text: m }); sent++; } catch {}
      await new Promise(r => setTimeout(r, 40));
    }
    return tg('sendMessage', { chat_id: chatId, text: `📢 Sent to ${sent}/${USERS.size}` });
  }
}

// ============================================================
// TASKS API
// ============================================================
async function handleTasks(body) {
  const u = verifyInitData(body.initData, process.env.BOT_TOKEN);
  if (!u) return { status: 403, data: { error: 'Invalid auth' } };

  const user = createUser(u);
  const action = body.action;

  if (action === 'list') {
    const tasks = TASKS.map(t => {
      const s = taskStatus(user, t);
      return { ...t, ...s, count: (user.tasks[t.id]?.count) || 0 };
    });
    return { status: 200, data: { tasks, user: publicUser(user) } };
  }

  if (action === 'complete') {
    const t = TASKS.find(x => x.id === body.taskId);
    if (!t) return { status: 404, data: { error: 'Unknown task' } };

    const s = taskStatus(user, t);
    if (!s.ready) return { status: 429, data: { error: 'Not ready yet', nextAt: s.nextAt } };

    const now = Date.now();
    const cur = user.tasks[t.id] || { count: 0, lastAt: 0, recent: [] };
    cur.count += 1;
    cur.lastAt = now;
    if (t.type === 'unlimited') {
      cur.recent = [...(cur.recent || []).filter(x => x > now - 3600000), now];
    }
    user.tasks[t.id] = cur;

    user.balance += t.reward;
    user.xp += t.reward;
    user.level = Math.floor(user.xp / 500) + 1;
    saveUser(user.id, user);
    return { status: 200, data: { ok: true, user: publicUser(user), reward: t.reward } };
  }

  if (action === 'profile') {
    return { status: 200, data: { user: publicUser(user) } };
  }

  return { status: 400, data: { error: 'Unknown action' } };
}

// ============================================================
// HTML — polished UI
// ============================================================
const HTML = () => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no, viewport-fit=cover" />
<meta name="theme-color" content="${BRAND_DARK}" />
<title>${APP_NAME}</title>
<link rel="icon" type="image/jpeg" href="${LOGO_URL}" />
<link rel="apple-touch-icon" href="${LOGO_URL}" />
<script src="https://telegram.org/js/telegram-web-app.js"><\/script>
<style>
:root{
  --bg:#0b0e14; --card:#141924; --card2:#1a2030; --line:#232a3b;
  --text:#eef2ff; --muted:#8f9bb3; --blue:#3b82f6; --blue2:#60a5fa;
  --green:#22c55e; --gold:#facc15; --red:#ef4444; --radius:16px;
}
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
html,body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Roboto,sans-serif;min-height:100vh;overflow-x:hidden}
body{
  background:radial-gradient(1200px 600px at 50% -20%,rgba(59,130,246,.16),transparent 60%),var(--bg);
  padding:14px 14px calc(20px + env(safe-area-inset-bottom));
  padding-top:calc(14px + env(safe-area-inset-top));
}
.screen{max-width:520px;margin:0 auto}
.hidden{display:none!important}

/* Loader & blocked */
.loader-wrap,.blocked-wrap{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:75vh;text-align:center;gap:16px;padding:24px}
.loader-wrap img,.blocked-wrap img{width:88px;height:88px;border-radius:22px;object-fit:cover;box-shadow:0 10px 40px rgba(59,130,246,.35)}
.spinner{width:42px;height:42px;border:3px solid rgba(255,255,255,.08);border-top-color:var(--blue);border-radius:50%;animation:spin .9s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.loader-wrap p,.blocked-wrap p{color:var(--muted);max-width:320px;line-height:1.5}

/* Header */
.header{display:flex;align-items:center;gap:12px;margin-bottom:14px}
.header img{width:44px;height:44px;border-radius:12px;object-fit:cover;box-shadow:0 0 0 2px rgba(59,130,246,.35),0 6px 20px rgba(0,0,0,.4)}
.header h1{font-size:19px;font-weight:800;line-height:1}
.header small{display:block;color:var(--muted);font-size:12px;margin-top:3px}
.pill{margin-left:auto;background:linear-gradient(135deg,var(--blue),var(--blue2));padding:6px 12px;border-radius:999px;font-size:12px;font-weight:700;color:#fff;box-shadow:0 4px 14px rgba(59,130,246,.4)}

/* Stats */
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px}
.stat{background:linear-gradient(180deg,var(--card),var(--card2));border:1px solid var(--line);border-radius:14px;padding:12px 8px;text-align:center}
.stat .v{font-size:19px;font-weight:800}
.stat .l{font-size:10px;color:var(--muted);margin-top:3px;text-transform:uppercase;letter-spacing:.8px;font-weight:700}
.stat.gold .v{color:var(--gold)} .stat.blue .v{color:var(--blue2)} .stat.green .v{color:var(--green)}

.notice{font-size:11.5px;color:var(--muted);text-align:center;margin-bottom:12px;padding:8px 12px;background:rgba(59,130,246,.06);border:1px solid rgba(59,130,246,.12);border-radius:10px;line-height:1.5}

/* Filters */
.filters{display:flex;gap:6px;overflow-x:auto;margin-bottom:12px;padding-bottom:4px;scrollbar-width:none}
.filters::-webkit-scrollbar{display:none}
.chip{padding:8px 14px;border:1px solid var(--line);background:var(--card);color:var(--muted);border-radius:999px;font-size:12px;font-weight:600;white-space:nowrap;cursor:pointer;transition:.15s}
.chip.active{background:linear-gradient(135deg,var(--blue),var(--blue2));color:#fff;border-color:transparent;box-shadow:0 4px 12px rgba(59,130,246,.35)}

/* Tabs */
.tabs{display:flex;gap:4px;background:var(--card);padding:5px;border-radius:14px;margin-bottom:12px;border:1px solid var(--line)}
.tab{flex:1;padding:9px 6px;border:none;border-radius:10px;background:transparent;color:var(--muted);font-size:12px;font-weight:700;cursor:pointer;transition:.15s}
.tab.active{background:linear-gradient(135deg,var(--blue),var(--blue2));color:#fff;box-shadow:0 4px 12px rgba(59,130,246,.3)}

/* Task cards */
.task-list{display:flex;flex-direction:column;gap:10px}
.task{background:linear-gradient(180deg,var(--card),var(--card2));border:1px solid var(--line);border-radius:14px;padding:14px;display:flex;align-items:center;gap:12px;position:relative;overflow:hidden}
.task::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:linear-gradient(180deg,var(--blue),var(--blue2))}
.task.ready::before{background:linear-gradient(180deg,var(--green),#4ade80)}
.task.locked{opacity:.72}
.task.done{opacity:.55}
.task .icon{width:42px;height:42px;border-radius:12px;background:rgba(59,130,246,.14);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0}
.task.ready .icon{background:rgba(34,197,94,.15)}
.task.done .icon{background:rgba(143,155,179,.15)}
.task .body{flex:1;min-width:0}
.task .title{font-size:14px;font-weight:700;margin-bottom:2px}
.task .desc{font-size:11.5px;color:var(--muted);line-height:1.4}
.task .meta{font-size:11px;color:var(--gold);font-weight:700;margin-top:5px;display:flex;gap:8px;align-items:center}
.task .meta .badge{background:rgba(59,130,246,.15);color:var(--blue2);padding:2px 7px;border-radius:6px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px}
.task .btn{padding:9px 14px;border:none;border-radius:10px;background:linear-gradient(135deg,var(--blue),var(--blue2));color:#fff;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;box-shadow:0 4px 12px rgba(59,130,246,.3);transition:.15s;min-width:82px;text-align:center}
.task .btn:active{transform:scale(.95)}
.task .btn:disabled{background:#232a3b;color:var(--muted);box-shadow:none;cursor:default}
.task .btn.done{background:rgba(34,197,94,.15);color:var(--green);box-shadow:none}
.task .btn.locked{background:rgba(143,155,179,.12);color:var(--muted);box-shadow:none;font-variant-numeric:tabular-nums}

.card{background:linear-gradient(180deg,var(--card),var(--card2));border:1px solid var(--line);border-radius:14px;padding:18px;margin-bottom:12px}
.card h2{font-size:16px;font-weight:800;margin-bottom:8px}
.card p{font-size:13px;color:var(--muted);line-height:1.55;margin-bottom:14px}
.btn-primary{width:100%;padding:14px;border:none;border-radius:12px;background:linear-gradient(135deg,var(--blue),var(--blue2));color:#fff;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 6px 20px rgba(59,130,246,.35);transition:.15s}
.btn-primary:active{transform:scale(.98)}
.btn-primary:disabled{opacity:.55;cursor:default;box-shadow:none}
.btn-ghost{display:block;width:100%;padding:13px;border:1px solid var(--line);border-radius:12px;background:var(--card);color:var(--text);font-size:13px;font-weight:600;cursor:pointer;text-align:center;text-decoration:none}
.invite-box{background:#0a0d14;border:1px dashed var(--line);border-radius:12px;padding:12px;font-size:11.5px;color:var(--blue2);word-break:break-all;text-align:center;margin:10px 0;font-family:ui-monospace,Menlo,monospace;line-height:1.5}
.profile-row{display:flex;justify-content:space-between;padding:11px 0;border-bottom:1px solid var(--line);font-size:13px}
.profile-row:last-child{border-bottom:none}
.profile-row span:first-child{color:var(--muted)}
.profile-row span:last-child{font-weight:700}
a{color:var(--blue2);text-decoration:none}

/* Toast */
.toast{position:fixed;left:50%;bottom:calc(20px + env(safe-area-inset-bottom));transform:translateX(-50%) translateY(20px);background:#141924;border:1px solid var(--line);color:#fff;padding:12px 18px;border-radius:12px;font-size:13px;font-weight:600;box-shadow:0 10px 30px rgba(0,0,0,.6);opacity:0;pointer-events:none;transition:.3s;z-index:999;max-width:90vw;text-align:center}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
.toast.success{border-color:rgba(34,197,94,.4);color:#86efac}
.toast.error{border-color:rgba(239,68,68,.4);color:#fca5a5}
</style>
</head>
<body>

<div id="loader" class="screen loader-wrap">
  <img src="${LOGO_URL}" />
  <div class="spinner"></div>
  <p>Opening ${APP_NAME}…</p>
</div>

<div id="blocked" class="screen blocked-wrap hidden">
  <img src="${LOGO_URL}" />
  <h1>Telegram Only</h1>
  <p>${APP_NAME} is a Telegram Mini App. It only opens inside the Telegram app.</p>
  <a href="https://t.me/${BOT_USERNAME}" class="btn-primary" style="display:inline-block;max-width:260px;text-align:center">Open @${BOT_USERNAME}</a>
</div>

<div id="app" class="screen hidden">
  <div class="header">
    <img src="${LOGO_URL}" />
    <div><h1>${APP_NAME}</h1><small id="greeting">Welcome</small></div>
    <div class="pill" id="levelPill">Lv 1</div>
  </div>

  <div class="stats">
    <div class="stat gold"><div class="v" id="balance">0</div><div class="l">NL</div></div>
    <div class="stat blue"><div class="v" id="xp">0</div><div class="l">XP</div></div>
    <div class="stat green"><div class="v" id="streak">0</div><div class="l">Streak</div></div>
  </div>

  <div class="notice">NL is an in-app progression token only. No cash value, no withdrawals.</div>

  <nav class="tabs">
    <button class="tab active" data-tab="tasks">🎯 Tasks</button>
    <button class="tab" data-tab="invite">🎁 Invite</button>
    <button class="tab" data-tab="profile">👤 Profile</button>
  </nav>

  <section id="tab-tasks" class="tab-panel">
    <div class="filters" id="filters">
      <button class="chip active" data-f="all">All</button>
      <button class="chip" data-f="ready">Ready</button>
      <button class="chip" data-f="once">Once</button>
      <button class="chip" data-f="daily">Daily</button>
      <button class="chip" data-f="cooldown">Repeatable</button>
      <button class="chip" data-f="unlimited">Unlimited</button>
      <button class="chip" data-f="done">Done</button>
    </div>
    <div class="task-list" id="taskList"></div>
  </section>

  <section id="tab-invite" class="tab-panel hidden">
    <div class="card">
      <h2>🎁 Invite friends — unlimited</h2>
      <p>You get <b>+50 NL</b> per friend. They get <b>+25 NL</b>. No cap.</p>
      <div class="invite-box" id="inviteLink">Tap below to generate…</div>
      <button id="copyInvite" class="btn-primary">Copy invite link</button>
    </div>
  </section>

  <section id="tab-profile" class="tab-panel hidden">
    <div class="card">
      <h2>👤 Your profile</h2>
      <div class="profile-row"><span>Name</span><span id="pName">—</span></div>
      <div class="profile-row"><span>Username</span><span id="pUser">—</span></div>
      <div class="profile-row"><span>Balance</span><span id="pBal">0 NL</span></div>
      <div class="profile-row"><span>Level</span><span id="pLvl">1</span></div>
      <div class="profile-row"><span>Referrals</span><span id="pRef">0</span></div>
      <div class="profile-row"><span>Tasks completed</span><span id="pTasks">0</span></div>
    </div>
    <div class="card">
      <h2>ℹ️ About</h2>
      <p>${APP_NAME} is a Telegram Mini App for entertainment. NL has no monetary value and cannot be withdrawn, sold, or exchanged.</p>
      <a href="/api/about" class="btn-ghost">Read full About & Privacy</a>
    </div>
  </section>
</div>

<div class="toast" id="toast"></div>

<script>
const tg = window.Telegram?.WebApp;
const initData = tg?.initData;
const $ = (id) => document.getElementById(id);
const screen = (el) => { document.querySelectorAll('.screen').forEach(s=>s.classList.add('hidden')); el.classList.remove('hidden'); };

let USER = null, TASKS = [], FILTER = 'all';
const TICK = setInterval(tick, 1000);

function toast(msg, type='') {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  clearTimeout(toast._t);
  toast._t = setTimeout(()=>t.className='toast '+type, 2400);
}
function fmt(ms) {
  if (ms <= 0) return '';
  const s = Math.floor(ms/1000);
  if (s < 60) return s + 's';
  const m = Math.floor(s/60), h = Math.floor(m/60);
  if (h > 0) return h + 'h ' + (m%60) + 'm';
  return m + 'm ' + (s%60) + 's';
}

async function api(action, extra={}) {
  try {
    const r = await fetch('/api/tasks', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ initData, action, ...extra })
    });
    return await r.json();
  } catch { return { error: 'Network error' }; }
}

function renderUser(u) {
  USER = u;
  $('balance').textContent = u.balance;
  $('xp').textContent = u.xp;
  $('streak').textContent = u.streak || 0;
  $('levelPill').textContent = 'Lv ' + u.level;
  $('greeting').textContent = 'Hi ' + (u.first_name || 'there') + ' 👋';
  $('pName').textContent = u.first_name || '—';
  $('pUser').textContent = u.username ? '@' + u.username : '—';
  $('pBal').textContent = u.balance + ' NL';
  $('pLvl').textContent = u.level;
  $('pRef').textContent = u.referrals;
  $('pTasks').textContent = Object.values(u.tasks || {}).reduce((a,t)=>a+(t.count||0),0);
}

function typeLabel(t) {
  if (t.type === 'once') return { text: 'Once', cls: '' };
  if (t.type === 'daily') return { text: 'Daily', cls: '' };
  if (t.type === 'cooldown') return { text: 'Repeatable', cls: '' };
  if (t.type === 'unlimited') return { text: 'Unlimited', cls: '' };
  return { text: '', cls: '' };
}

function renderTasks() {
  const list = $('taskList');
  list.innerHTML = '';

  let items = TASKS.slice();
  if (FILTER === 'ready')      items = items.filter(t => t.ready);
  else if (FILTER === 'done')  items = items.filter(t => t.done);
  else if (FILTER === 'once')  items = items.filter(t => t.type === 'once');
  else if (FILTER === 'daily') items = items.filter(t => t.type === 'daily');
  else if (FILTER === 'cooldown')  items = items.filter(t => t.type === 'cooldown');
  else if (FILTER === 'unlimited') items = items.filter(t => t.type === 'unlimited');

  if (!items.length) {
    list.innerHTML = '<div class="card" style="text-align:center"><p style="margin:0">No tasks in this category right now.</p></div>';
    return;
  }

  items.forEach(t => {
    const label = typeLabel(t);
    const el = document.createElement('div');
    const cls = t.done ? 'task done' : (t.ready ? 'task ready' : 'task locked');
    el.className = cls;
    el.dataset.id = t.id;
    el.innerHTML =
      '<div class="icon">' + (t.done ? '✅' : t.icon) + '</div>' +
      '<div class="body">' +
        '<div class="title">' + t.title + '</div>' +
        '<div class="desc">' + t.desc + '</div>' +
        '<div class="meta">+' + t.reward + ' NL ' +
          '<span class="badge">' + label.text + '</span>' +
          (t.count ? '<span style="color:var(--muted)">· done ' + t.count + 'x</span>' : '') +
        '</div>' +
      '</div>' +
      '<button class="btn" data-id="' + t.id + '"></button>';
    const btn = el.querySelector('button');
    btn.onclick = () => handleTask(t);
    list.appendChild(el);
    refreshBtn(btn, t);
  });
}

function refreshBtn(btn, t) {
  if (t.done) { btn.disabled = true; btn.className = 'btn done'; btn.textContent = 'Done'; return; }
  if (t.ready) {
    btn.disabled = false;
    btn.className = 'btn';
    btn.textContent = t.type === 'once' ? 'Claim' : (t.type === 'daily' ? 'Claim' : 'Start');
    return;
  }
  btn.disabled = true;
  btn.className = 'btn locked';
  btn.textContent = fmt((t.nextAt || 0) - Date.now());
}

async function handleTask(t) {
  // For link tasks: open URL first, then credit
  if (t.url) {
    try { tg?.openLink?.(t.url) || window.open(t.url, '_blank'); } catch { window.open(t.url, '_blank'); }
    await new Promise(r => setTimeout(r, 800));
  }
  // For timer tasks: small delay to feel real
  if (t.type === 'cooldown' && (t.id.includes('stay') || t.id.includes('browse'))) {
    toast('Verifying…');
    await new Promise(r => setTimeout(r, 1200));
  }
  const r = await api('complete', { taskId: t.id });
  if (r.ok) {
    tg?.HapticFeedback?.notificationOccurred('success');
    toast('+' + r.reward + ' NL', 'success');
    renderUser(r.user);
    await loadTasks();
  } else {
    toast(r.error || 'Not available', 'error');
    await loadTasks();
  }
}

async function loadTasks() {
  const d = await api('list');
  if (d.error) return toast(d.error, 'error');
  TASKS = d.tasks;
  renderUser(d.user);
  renderTasks();
}

function tick() {
  if (!TASKS.length) return;
  let needs = false;
  TASKS.forEach(t => {
    if (!t.done && !t.ready) {
      if ((t.nextAt || 0) <= Date.now()) { t.ready = true; t.nextAt = 0; needs = true; }
      else {
        const btn = document.querySelector('.task[data-id="' + t.id + '"] .btn');
        if (btn) btn.textContent = fmt(t.nextAt - Date.now());
      }
    }
  });
  if (needs) renderTasks();
}

async function init() {
  if (!initData) return screen($('blocked'));
  tg.ready(); tg.expand();
  try { tg.setHeaderColor?.(BRAND_DARK); tg.setBackgroundColor?.(BRAND_DARK); } catch {}

  try {
    const r = await api('profile');
    if (r.error) return screen($('blocked'));
    renderUser(r.user);
    await loadTasks();
    screen($('app'));
  } catch { screen($('blocked')); }

  document.querySelectorAll('.tab').forEach(btn=>{
    btn.onclick = () => {
      document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p=>p.classList.add('hidden'));
      btn.classList.add('active');
      $('tab-'+btn.dataset.tab).classList.remove('hidden');
    };
  });
  document.querySelectorAll('.chip').forEach(c=>{
    c.onclick = () => {
      document.querySelectorAll('.chip').forEach(x=>x.classList.remove('active'));
      c.classList.add('active');
      FILTER = c.dataset.f;
      renderTasks();
    };
  });

  $('copyInvite').onclick = async () => {
    const r = await api('profile');
    const link = 'https://t.me/${BOT_USERNAME}?start=ref_' + r.user.id;
    $('inviteLink').textContent = link;
    try { navigator.clipboard.writeText(link); } catch {}
    tg?.showAlert?.('Link copied!');
  };
}
window.addEventListener('load', init);
<\/script>
</body>
</html>`;

const ABOUT = () => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>About · ${APP_NAME}</title>
<link rel="icon" type="image/jpeg" href="${LOGO_URL}" />
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0b0e14;color:#eef2ff;padding:24px;line-height:1.65;max-width:640px;margin:0 auto}
.brand{display:flex;align-items:center;gap:12px;margin-bottom:16px}
.brand img{width:56px;height:56px;border-radius:14px}
h1{font-size:22px;margin:0}
h2{font-size:15px;margin:20px 0 6px;color:#60a5fa}
a{color:#60a5fa}
</style>
</head>
<body>
<div class="brand"><img src="${LOGO_URL}" /><h1>About ${APP_NAME}</h1></div>
<p>${APP_NAME} is a Telegram Mini App for entertainment. Users complete simple in-app tasks to earn "NL", a virtual progression token used only inside the app.</p>
<h2>Points Policy</h2>
<p>NL has <b>no monetary value</b>. It cannot be withdrawn, sold, traded, or exchanged for cash, crypto, or goods.</p>
<h2>Advertising</h2>
<p>${APP_NAME} displays optional rewarded ads. Watching ads is always a choice and never required to use the app.</p>
<h2>Data</h2>
<p>We store your Telegram user ID, username, and in-app progress. We do not store messages, contacts, or payment information.</p>
<h2>Content</h2>
<p>${APP_NAME} contains no adult content, gambling, real-money rewards, or financial services.</p>
<h2>Contact</h2>
<p>Bot: <a href="https://t.me/${BOT_USERNAME}">@${BOT_USERNAME}</a></p>
<p><a href="/">← Back to app</a></p>
</body>
</html>`;

// ============================================================
// NETLIFY HANDLER
// ============================================================
exports.handler = async (event) => {
  const path = event.path.replace(/\/+$/, '') || '/';
  const method = event.httpMethod;

  if (path === '/api/bot' && method === 'POST') {
    try { await handleBot(JSON.parse(event.body || '{}')); } catch (e) { console.error(e); }
    return { statusCode: 200, body: 'ok' };
  }

  if (path === '/api/tasks' && method === 'POST') {
    try {
      const body = JSON.parse(event.body || '{}');
      const { status, data } = await handleTasks(body);
      return json(status, data);
    } catch { return json(400, { error: 'Bad request' }); }
  }

  if (path === '/api/ads') {
    return json(200, {
      enabled: process.env.ADS_ENABLED === 'true',
      provider: process.env.ADS_PROVIDER || 'adsgram',
      adsgramBlockId: process.env.ADSGRAM_BLOCK_ID || '',
    });
  }

  if (path === '/api/about') {
    return { statusCode: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' }, body: ABOUT() };
  }

  if (path === '/' || path === '/index.html') {
    return { statusCode: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' }, body: HTML() };
  }

  return { statusCode: 404, body: 'Not found' };
};

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
