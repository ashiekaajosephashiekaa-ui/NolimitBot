// ============================================================
// NooLimit — Telegram Mini App + Bot with REAL task verification
// ============================================================

const crypto = require('crypto');

const APP_NAME = 'NooLimit';
const LOGO_URL = 'https://iili.io/nuLWzp2.jpg';
const BOT_USERNAME = 'NoolimitsBot';
const BRAND_DARK = '#0b0e14';

// ============================================================
// STORAGE — Upstash Redis (recommended) with in-memory fallback
// ============================================================
const R_URL = process.env.UPSTASH_REDIS_REST_URL;
const R_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const HAS_REDIS = !!(R_URL && R_TOKEN);

async function redis(cmd) {
  if (!HAS_REDIS) return null;
  try {
    const res = await fetch(R_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${R_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd),
    });
    const j = await res.json();
    return j.result;
  } catch (e) { console.error('redis', e); return null; }
}

const MEM = new Map();

async function getUser(id) {
  if (HAS_REDIS) {
    const v = await redis(['GET', `u:${id}`]);
    if (!v) return null;
    try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return null; }
  }
  return MEM.get(String(id)) || null;
}
async function saveUser(id, u) {
  if (HAS_REDIS) return redis(['SET', `u:${id}`, JSON.stringify(u)]);
  MEM.set(String(id), u);
  return u;
}
async function userCount() {
  if (HAS_REDIS) {
    const keys = await redis(['KEYS', 'u:*']);
    return Array.isArray(keys) ? keys.length : 0;
  }
  return MEM.size;
}
async function allIds() {
  if (HAS_REDIS) {
    const keys = await redis(['KEYS', 'u:*']);
    return (keys || []).map(k => k.replace('u:', ''));
  }
  return [...MEM.keys()];
}

function newUser(p) {
  return {
    id: p.id, username: p.username || '', first_name: p.first_name || '',
    balance: 0, level: 1, xp: 0,
    referrals: 0, referredBy: null,
    tasks: {}, lastDaily: 0, streak: 0,
    createdAt: Date.now(),
  };
}
async function getOrCreate(p) {
  let u = await getUser(p.id);
  if (!u) { u = newUser(p); await saveUser(p.id, u); }
  return u;
}

// ============================================================
// TASKS — each one requires REAL user action to complete
// type:
//   'channel'   — bot verifies via getChatMember
//   'timer'     — user must wait N seconds (real countdown)
//   'link'      — user opens URL, then waits 5s, then verifies
//   'instant'   — daily check-in / open (1 tap = done, daily reset)
//   'unlimited' — repeatable tap task with hourly cap
// ============================================================

// 🔧 CONFIGURE YOUR CHANNELS HERE (must be public or bot must be admin)
const CHANNELS = {
  main: '@telegram',           // ← replace with your channel username
  news: '@durov',              // ← replace with your channel username
};

const TASKS = [
  // ---- CHANNEL JOINS (real verification) ----
  { id: 'ch_main',    type: 'channel', channel: CHANNELS.main, reward: 50, title: 'Join our main channel', icon: '📢', desc: 'Bot verifies you actually joined.' },
  { id: 'ch_news',    type: 'channel', channel: CHANNELS.news, reward: 40, title: 'Join announcements',    icon: '📣', desc: 'Bot verifies you actually joined.' },

  // ---- TIMER TASKS (must wait for real) ----
  { id: 'tm_30',      type: 'timer', seconds: 30, reward: 25, title: 'Stay 30 seconds',   icon: '⏱️', desc: 'Keep this screen open — countdown must finish.' },
  { id: 'tm_60',      type: 'timer', seconds: 60, reward: 50, title: 'Stay 60 seconds',   icon: '⏳', desc: 'Keep this screen open — countdown must finish.' },
  { id: 'tm_120',     type: 'timer', seconds: 120, reward: 100, title: 'Stay 2 minutes',   icon: '🕐', desc: 'Keep this screen open — long but big reward.' },

  // ---- LINK TASKS (open + verify) ----
  { id: 'lk_x',       type: 'link', url: 'https://x.com/',      wait: 5, reward: 30, title: 'Visit our X profile', icon: '🐦', desc: 'Opens X, come back, tap Verify.' },
  { id: 'lk_web',     type: 'link', url: 'https://telegram.org', wait: 5, reward: 20, title: 'Visit our website',   icon: '🌐', desc: 'Opens site, come back, tap Verify.' },

  // ---- INSTANT DAILY ----
  { id: 'in_checkin', type: 'instant', daily: true, reward: 15, title: 'Daily check-in', icon: '📅', desc: 'One tap, resets every 24h.' },

  // ---- UNLIMITED ----
  { id: 'un_tap',     type: 'unlimited', hourly: 100, reward: 1, title: 'Tap for 1 NL', icon: '👊', desc: 'Up to 100 taps per hour.' },
  { id: 'un_share',   type: 'unlimited', hourly: 5, reward: 20, title: 'Share NooLimit', icon: '📤', desc: 'Share link. Max 5/hour.' },
];

// ---------- Task status ----------
function taskStatus(user, t) {
  const s = user.tasks[t.id] || { count: 0, lastAt: 0, recent: [] };
  const now = Date.now();

  if (t.type === 'channel') {
    // actual check happens server-side when verify is called
    const done = s.count > 0;
    return { done, ready: !done, nextAt: 0 };
  }
  if (t.type === 'timer' || t.type === 'link') {
    const done = s.count > 0;
    return { done, ready: !done, nextAt: 0 };
  }
  if (t.type === 'instant') {
    const DAY = 86400000;
    const elapsed = now - (s.lastAt || 0);
    const ready = elapsed >= DAY;
    return { done: false, ready, nextAt: ready ? 0 : s.lastAt + DAY };
  }
  if (t.type === 'unlimited') {
    const hourAgo = now - 3600000;
    const recent = (s.recent || []).filter(x => x > hourAgo);
    const ready = recent.length < t.hourly;
    return { done: false, ready, nextAt: ready ? 0 : (recent[0] + 3600000), recentCount: recent.length };
  }
  return { done: false, ready: true, nextAt: 0 };
}

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

// ---------- Real channel verification ----------
async function checkChannelMembership(userId, channel) {
  try {
    const r = await fetch(tgUrl('getChatMember'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: channel, user_id: userId }),
    });
    const j = await r.json();
    if (!j.ok) return { ok: false, error: j.description || 'Bot cannot check this channel. Add the bot as admin.' };
    const status = j.result?.status;
    const isMember = ['creator', 'administrator', 'member'].includes(status);
    return { ok: true, isMember };
  } catch (e) {
    return { ok: false, error: 'Network error' };
  }
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
  const user = await getOrCreate(from);

  const launchBtn = {
    inline_keyboard: [[{ text: `🚀 Launch ${APP_NAME}`, web_app: { url: WEBAPP_URL } }]],
  };

  if (cmd === '/start') {
    const ref = text.match(/ref_(\d+)/);
    if (ref && !user.referredBy && Number(ref[1]) !== from.id) {
      const r = await getUser(Number(ref[1]));
      if (r) {
        r.balance += 50; r.referrals = (r.referrals || 0) + 1; await saveUser(r.id, r);
        user.referredBy = r.id; user.balance += 25; await saveUser(user.id, user);
        tg('sendMessage', { chat_id: r.id, text: '🎉 New referral! +50 NL' });
      }
    }
    return tg('sendMessage', {
      chat_id: chatId,
      text:
        `👋 Welcome to *${APP_NAME}*, ${from.first_name}!\n\n` +
        `Open the Mini App to see tasks and rewards.\n\n` +
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
        `/start – Register\n/balance – Balance\n/invite – Referral link\n` +
        `/tasks – Open app\n/help – Menu\n\n` +
        `NL is an in-app token with no monetary value.`,
      parse_mode: 'Markdown',
      reply_markup: launchBtn,
    });
  }

  if (cmd === '/tasks') {
    return tg('sendMessage', { chat_id: chatId, text: '🎯 Open the Mini App:', reply_markup: launchBtn });
  }

  if (cmd === '/stats' && String(from.id) === process.env.ADMIN_ID) {
    const n = await userCount();
    return tg('sendMessage', { chat_id: chatId, text: `📊 Users: ${n}` });
  }

  if (cmd === '/broadcast' && String(from.id) === process.env.ADMIN_ID) {
    const m = text.replace('/broadcast', '').trim();
    if (!m) return tg('sendMessage', { chat_id: chatId, text: 'Usage: /broadcast <msg>' });
    const ids = await allIds();
    let sent = 0;
    for (const id of ids) {
      try { await tg('sendMessage', { chat_id: id, text: m }); sent++; } catch {}
      await new Promise(r => setTimeout(r, 40));
    }
    return tg('sendMessage', { chat_id: chatId, text: `📢 Sent to ${sent}/${ids.length}` });
  }
}

// ============================================================
// TASKS API
// ============================================================
async function handleTasks(body) {
  if (!process.env.BOT_TOKEN) {
    return { status: 500, data: { error: 'Server misconfigured: BOT_TOKEN missing' } };
  }
  const u = verifyInitData(body.initData, process.env.BOT_TOKEN);
  if (!u) return { status: 403, data: { error: 'Invalid auth — reopen the app from Telegram' } };

  const user = await getOrCreate(u);
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

    // ---- CHANNEL TASK: real verification ----
    if (t.type === 'channel') {
      const ch = await checkChannelMembership(user.id, t.channel);
      if (!ch.ok) return { status: 400, data: { error: ch.error || 'Cannot verify. Try again.' } };
      if (!ch.isMember) return { status: 400, data: { error: 'You have not joined yet. Join the channel, then come back.' } };
    }

    // ---- TIMER/LINK: client passes proof that it waited ----
    if (t.type === 'timer' || t.type === 'link') {
      const elapsed = Number(body.elapsed || 0);
      const required = t.seconds || t.wait || 5;
      if (elapsed < required) {
        return { status: 400, data: { error: `You must wait ${required}s. Only ${Math.floor(elapsed)}s passed.` } };
      }
    }

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
    await saveUser(user.id, user);
    return { status: 200, data: { ok: true, user: publicUser(user), reward: t.reward } };
  }

  if (action === 'profile') {
    return { status: 200, data: { user: publicUser(user) } };
  }

  return { status: 400, data: { error: 'Unknown action' } };
}

// ============================================================
// HTML
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
:root{--bg:#0b0e14;--card:#141924;--card2:#1a2030;--line:#232a3b;--text:#eef2ff;--muted:#8f9bb3;--blue:#3b82f6;--blue2:#60a5fa;--green:#22c55e;--gold:#facc15;--red:#ef4444}
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
html,body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Roboto,sans-serif;min-height:100vh}
body{background:radial-gradient(1200px 600px at 50% -20%,rgba(59,130,246,.16),transparent 60%),var(--bg);padding:14px 14px calc(20px + env(safe-area-inset-bottom));padding-top:calc(14px + env(safe-area-inset-top))}
.screen{max-width:520px;margin:0 auto}.hidden{display:none!important}
.loader-wrap,.blocked-wrap{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:75vh;text-align:center;gap:16px;padding:24px}
.loader-wrap img,.blocked-wrap img{width:88px;height:88px;border-radius:22px;object-fit:cover;box-shadow:0 10px 40px rgba(59,130,246,.35)}
.spinner{width:42px;height:42px;border:3px solid rgba(255,255,255,.08);border-top-color:var(--blue);border-radius:50%;animation:spin .9s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.loader-wrap p,.blocked-wrap p{color:var(--muted);max-width:320px;line-height:1.5}
.header{display:flex;align-items:center;gap:12px;margin-bottom:14px}
.header img{width:44px;height:44px;border-radius:12px;object-fit:cover;box-shadow:0 0 0 2px rgba(59,130,246,.35)}
.header h1{font-size:19px;font-weight:800;line-height:1}
.header small{display:block;color:var(--muted);font-size:12px;margin-top:3px}
.pill{margin-left:auto;background:linear-gradient(135deg,var(--blue),var(--blue2));padding:6px 12px;border-radius:999px;font-size:12px;font-weight:700;color:#fff}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px}
.stat{background:linear-gradient(180deg,var(--card),var(--card2));border:1px solid var(--line);border-radius:14px;padding:12px 8px;text-align:center}
.stat .v{font-size:19px;font-weight:800}.stat .l{font-size:10px;color:var(--muted);margin-top:3px;text-transform:uppercase;letter-spacing:.8px;font-weight:700}
.stat.gold .v{color:var(--gold)}.stat.blue .v{color:var(--blue2)}.stat.green .v{color:var(--green)}
.notice{font-size:11.5px;color:var(--muted);text-align:center;margin-bottom:12px;padding:8px 12px;background:rgba(59,130,246,.06);border:1px solid rgba(59,130,246,.12);border-radius:10px}
.tabs{display:flex;gap:4px;background:var(--card);padding:5px;border-radius:14px;margin-bottom:12px;border:1px solid var(--line)}
.tab{flex:1;padding:9px 6px;border:none;border-radius:10px;background:transparent;color:var(--muted);font-size:12px;font-weight:700;cursor:pointer}
.tab.active{background:linear-gradient(135deg,var(--blue),var(--blue2));color:#fff}
.task-list{display:flex;flex-direction:column;gap:10px}
.task{background:linear-gradient(180deg,var(--card),var(--card2));border:1px solid var(--line);border-radius:14px;padding:14px;display:flex;align-items:center;gap:12px;position:relative;overflow:hidden}
.task::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:linear-gradient(180deg,var(--blue),var(--blue2))}
.task.ready::before{background:linear-gradient(180deg,var(--green),#4ade80)}
.task.locked{opacity:.72}.task.done{opacity:.55}
.task .icon{width:42px;height:42px;border-radius:12px;background:rgba(59,130,246,.14);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0}
.task.ready .icon{background:rgba(34,197,94,.15)}
.task .body{flex:1;min-width:0}
.task .title{font-size:14px;font-weight:700;margin-bottom:2px}
.task .desc{font-size:11.5px;color:var(--muted);line-height:1.4}
.task .meta{font-size:11px;color:var(--gold);font-weight:700;margin-top:5px}
.task .btn{padding:9px 14px;border:none;border-radius:10px;background:linear-gradient(135deg,var(--blue),var(--blue2));color:#fff;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;min-width:82px;text-align:center}
.task .btn:active{transform:scale(.95)}
.task .btn:disabled{background:#232a3b;color:var(--muted);cursor:default}
.task .btn.done{background:rgba(34,197,94,.15);color:var(--green)}
.task .btn.locked{background:rgba(143,155,179,.12);color:var(--muted);font-variant-numeric:tabular-nums}
.card{background:linear-gradient(180deg,var(--card),var(--card2));border:1px solid var(--line);border-radius:14px;padding:18px;margin-bottom:12px}
.card h2{font-size:16px;font-weight:800;margin-bottom:8px}
.card p{font-size:13px;color:var(--muted);line-height:1.55;margin-bottom:14px}
.btn-primary{width:100%;padding:14px;border:none;border-radius:12px;background:linear-gradient(135deg,var(--blue),var(--blue2));color:#fff;font-size:14px;font-weight:700;cursor:pointer}
.btn-primary:disabled{opacity:.55;cursor:default}
.btn-ghost{display:block;width:100%;padding:13px;border:1px solid var(--line);border-radius:12px;background:var(--card);color:var(--text);font-size:13px;font-weight:600;text-align:center;text-decoration:none}
.invite-box{background:#0a0d14;border:1px dashed var(--line);border-radius:12px;padding:12px;font-size:11.5px;color:var(--blue2);word-break:break-all;text-align:center;margin:10px 0;font-family:ui-monospace,Menlo,monospace}
.profile-row{display:flex;justify-content:space-between;padding:11px 0;border-bottom:1px solid var(--line);font-size:13px}
.profile-row:last-child{border-bottom:none}.profile-row span:first-child{color:var(--muted)}.profile-row span:last-child{font-weight:700}
a{color:var(--blue2);text-decoration:none}
.toast{position:fixed;left:50%;bottom:calc(20px + env(safe-area-inset-bottom));transform:translateX(-50%) translateY(20px);background:#141924;border:1px solid var(--line);color:#fff;padding:12px 18px;border-radius:12px;font-size:13px;font-weight:600;box-shadow:0 10px 30px rgba(0,0,0,.6);opacity:0;pointer-events:none;transition:.3s;z-index:999;max-width:90vw;text-align:center}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
.toast.success{border-color:rgba(34,197,94,.4);color:#86efac}
.toast.error{border-color:rgba(239,68,68,.4);color:#fca5a5}

/* Modal */
.modal{position:fixed;inset:0;background:rgba(0,0,0,.75);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:20px;z-index:1000}
.modal .box{background:linear-gradient(180deg,#141924,#1a2030);border:1px solid var(--line);border-radius:18px;padding:22px;max-width:380px;width:100%;text-align:center}
.modal .box h3{font-size:18px;font-weight:800;margin-bottom:8px}
.modal .box p{font-size:13px;color:var(--muted);line-height:1.5;margin-bottom:16px}
.progress{height:10px;background:#0a0d14;border-radius:999px;overflow:hidden;margin:16px 0;border:1px solid var(--line)}
.progress .bar{height:100%;background:linear-gradient(90deg,var(--blue),var(--blue2));border-radius:999px;width:0%;transition:width 1s linear}
.timer-text{font-size:32px;font-weight:800;color:var(--blue2);font-variant-numeric:tabular-nums}
.modal-btns{display:flex;gap:8px;margin-top:12px}
.modal-btns button{flex:1;padding:12px;border:none;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer}
.modal-btns .ok{background:linear-gradient(135deg,var(--blue),var(--blue2));color:#fff}
.modal-btns .ok:disabled{opacity:.5;cursor:default}
.modal-btns .cancel{background:#232a3b;color:var(--text)}
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
      <p>${APP_NAME} is a Telegram Mini App for entertainment. NL has no monetary value.</p>
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

let USER = null, TASKS = [];
setInterval(tick, 1000);

function toast(msg, type='') {
  const t = $('toast'); t.textContent = msg; t.className = 'toast show ' + type;
  clearTimeout(toast._t);
  toast._t = setTimeout(()=>t.className='toast '+type, 2600);
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

function renderTasks() {
  const list = $('taskList'); list.innerHTML = '';
  TASKS.forEach(t => {
    const el = document.createElement('div');
    const cls = t.done ? 'task done' : (t.ready ? 'task ready' : 'task locked');
    el.className = cls;
    el.dataset.id = t.id;
    el.innerHTML =
      '<div class="icon">' + (t.done ? '✅' : t.icon) + '</div>' +
      '<div class="body">' +
        '<div class="title">' + t.title + '</div>' +
        '<div class="desc">' + t.desc + '</div>' +
        '<div class="meta">+' + t.reward + ' NL' + (t.count ? ' · done ' + t.count + 'x' : '') + '</div>' +
      '</div>' +
      '<button class="btn" data-id="' + t.id + '"></button>';
    el.querySelector('button').onclick = () => handleTask(t);
    list.appendChild(el);
    refreshBtn(el.querySelector('button'), t);
  });
}
function refreshBtn(btn, t) {
  if (t.done) { btn.disabled = true; btn.className = 'btn done'; btn.textContent = 'Done'; return; }
  if (t.ready) {
    btn.disabled = false; btn.className = 'btn';
    btn.textContent = t.type === 'channel' ? 'Verify' : (t.type === 'timer' ? 'Start' : (t.type === 'link' ? 'Open' : 'Claim'));
    return;
  }
  btn.disabled = true; btn.className = 'btn locked';
  btn.textContent = fmt((t.nextAt || 0) - Date.now());
}

// -------- REAL task performance --------
async function handleTask(t) {
  if (t.type === 'channel') {
    // open the channel, then verify
    const channelUrl = 'https://t.me/' + (t.channel || '').replace('@','');
    try { tg?.openTelegramLink?.(channelUrl) || window.open(channelUrl, '_blank'); } catch { window.open(channelUrl, '_blank'); }
    // small delay so user can switch back
    setTimeout(async () => {
      const r = await api('complete', { taskId: t.id });
      if (r.ok) { toast('+' + r.reward + ' NL', 'success'); renderUser(r.user); await loadTasks(); }
      else toast(r.error || 'Verification failed', 'error');
    }, 1500);
    return;
  }

  if (t.type === 'timer') {
    return runTimerTask(t);
  }

  if (t.type === 'link') {
    return runLinkTask(t);
  }

  // instant / unlimited
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

// ---- TIMER: user must actually wait ----
function runTimerTask(t) {
  const secs = t.seconds || 30;
  let left = secs;
  const start = Date.now();
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML =
    '<div class="box">' +
      '<h3>' + t.icon + ' ' + t.title + '</h3>' +
      '<p>Keep this open. The reward unlocks when the timer ends.</p>' +
      '<div class="timer-text" id="tt">' + left + 's</div>' +
      '<div class="progress"><div class="bar" id="tb"></div></div>' +
      '<div class="modal-btns">' +
        '<button class="cancel" id="mc">Cancel</button>' +
        '<button class="ok" id="mo" disabled>Verifying…</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);
  const bar = modal.querySelector('#tb');
  const tt = modal.querySelector('#tt');
  const ok = modal.querySelector('#mo');

  const iv = setInterval(async () => {
    left--;
    tt.textContent = Math.max(0,left) + 's';
    bar.style.width = ((secs - Math.max(0,left))/secs*100) + '%';
    if (left <= 0) {
      clearInterval(iv);
      ok.disabled = false;
      ok.textContent = 'Claim ' + t.reward + ' NL';
      ok.onclick = async () => {
        const elapsed = (Date.now() - start) / 1000;
        const r = await api('complete', { taskId: t.id, elapsed });
        modal.remove();
        if (r.ok) {
          tg?.HapticFeedback?.notificationOccurred('success');
          toast('+' + r.reward + ' NL', 'success');
          renderUser(r.user);
          await loadTasks();
        } else toast(r.error || 'Failed', 'error');
      };
    }
  }, 1000);

  modal.querySelector('#mc').onclick = () => { clearInterval(iv); modal.remove(); };
}

// ---- LINK: open URL, wait, then verify ----
function runLinkTask(t) {
  const secs = t.wait || 5;
  let left = secs;
  const start = Date.now();
  try { tg?.openLink?.(t.url) || window.open(t.url, '_blank'); } catch { window.open(t.url, '_blank'); }

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML =
    '<div class="box">' +
      '<h3>' + t.icon + ' ' + t.title + '</h3>' +
      '<p>Link opened in your browser. Come back and wait for verification.</p>' +
      '<div class="timer-text" id="tt">' + left + 's</div>' +
      '<div class="progress"><div class="bar" id="tb"></div></div>' +
      '<div class="modal-btns">' +
        '<button class="cancel" id="mc">Cancel</button>' +
        '<button class="ok" id="mo" disabled>Verifying…</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);
  const bar = modal.querySelector('#tb');
  const tt = modal.querySelector('#tt');
  const ok = modal.querySelector('#mo');

  const iv = setInterval(async () => {
    left--;
    tt.textContent = Math.max(0,left) + 's';
    bar.style.width = ((secs - Math.max(0,left))/secs*100) + '%';
    if (left <= 0) {
      clearInterval(iv);
      ok.disabled = false;
      ok.textContent = 'Verify & claim ' + t.reward + ' NL';
      ok.onclick = async () => {
        const elapsed = (Date.now() - start) / 1000;
        const r = await api('complete', { taskId: t.id, elapsed });
        modal.remove();
        if (r.ok) {
          tg?.HapticFeedback?.notificationOccurred('success');
          toast('+' + r.reward + ' NL', 'success');
          renderUser(r.user);
          await loadTasks();
        } else toast(r.error || 'Failed', 'error');
      };
    }
  }, 1000);

  modal.querySelector('#mc').onclick = () => { clearInterval(iv); modal.remove(); };
}

async function loadTasks() {
  const d = await api('list');
  if (d.error) { toast(d.error, 'error'); return; }
  TASKS = d.tasks;
  renderUser(d.user);
  renderTasks();
}
function tick() {
  if (!TASKS.length) return;
  let refresh = false;
  TASKS.forEach(t => {
    if (!t.done && !t.ready && (t.nextAt || 0) <= Date.now()) {
      t.ready = true; t.nextAt = 0; refresh = true;
    } else if (!t.done && !t.ready) {
      const btn = document.querySelector('.task[data-id="' + t.id + '"] .btn');
      if (btn) btn.textContent = fmt(t.nextAt - Date.now());
    }
  });
  if (refresh) renderTasks();
}

async function init() {
  if (!initData) return screen($('blocked'));
  tg.ready(); tg.expand();
  try { tg.setHeaderColor?.(BRAND_DARK); tg.setBackgroundColor?.(BRAND_DARK); } catch {}

  try {
    const r = await api('profile');
    if (r.error) { toast(r.error, 'error'); return screen($('blocked')); }
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
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>About · ${APP_NAME}</title><link rel="icon" type="image/jpeg" href="${LOGO_URL}" />
<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0b0e14;color:#eef2ff;padding:24px;line-height:1.65;max-width:640px;margin:0 auto}
.brand{display:flex;align-items:center;gap:12px;margin-bottom:16px}.brand img{width:56px;height:56px;border-radius:14px}
h1{font-size:22px;margin:0}h2{font-size:15px;margin:20px 0 6px;color:#60a5fa}a{color:#60a5fa}</style></head>
<body><div class="brand"><img src="${LOGO_URL}" /><h1>About ${APP_NAME}</h1></div>
<p>${APP_NAME} is a Telegram Mini App for entertainment. Users complete simple in-app tasks to earn "NL", a virtual progression token used only inside the app.</p>
<h2>Points Policy</h2><p>NL has <b>no monetary value</b>. It cannot be withdrawn, sold, traded, or exchanged for cash, crypto, or goods.</p>
<h2>Advertising</h2><p>${APP_NAME} displays optional rewarded ads. Watching ads is always a choice and never required to use the app.</p>
<h2>Data</h2><p>We store your Telegram user ID, username, and in-app progress. We do not store messages, contacts, or payment information.</p>
<h2>Content</h2><p>${APP_NAME} contains no adult content, gambling, real-money rewards, or financial services.</p>
<h2>Contact</h2><p>Bot: <a href="https://t.me/${BOT_USERNAME}">@${BOT_USERNAME}</a></p>
<p><a href="/">← Back to app</a></p></body></html>`;

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
    } catch (e) { return json(500, { error: 'Server error', detail: String(e) }); }
  }

  if (path === '/api/debug') {
    return json(200, {
      botTokenSet: !!process.env.BOT_TOKEN,
      adminIdSet: !!process.env.ADMIN_ID,
      webappUrl: process.env.WEBAPP_URL || '(not set)',
      redisConfigured: HAS_REDIS,
      userCount: await userCount(),
      tasksCount: TASKS.length,
      channels: CHANNELS,
    });
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
