// ============================================================
// NooLimit — Telegram Mini App + Bot
// 6 feature tiles · no channels required
// ============================================================

const crypto = require('crypto');

const APP_NAME = 'NooLimit';
const LOGO_URL = 'https://iili.io/nuLWzp2.jpg';
const BOT_USERNAME = 'NoolimitsBot';

// ---------- Storage ----------
const USERS = new Map();
async function getUser(id) { return USERS.get(String(id)) || null; }
async function saveUser(id, u) { USERS.set(String(id), u); return u; }
async function userCount() { return USERS.size; }
async function allIds() { return [...USERS.keys()]; }

function newUser(p) {
  return {
    id: p.id, username: p.username || '', first_name: p.first_name || '',
    balance: 0, level: 1, xp: 0,
    referrals: 0, referredBy: null,
    tasks: {}, lastDaily: 0, streak: 0, createdAt: Date.now(),
  };
}
async function getOrCreate(p) {
  let u = await getUser(p.id);
  if (!u) { u = newUser(p); await saveUser(p.id, u); }
  return u;
}

// ============================================================
// 6 FEATURES
// ============================================================
const FEATURES = [
  { id: 'daily',   icon: '📅', title: 'Daily Tasks',    sub: 'Reset every 24h',     color: '#3b82f6' },
  { id: 'timers',  icon: '⏱️', title: 'Timed Rewards',  sub: 'Wait to earn NL',     color: '#8b5cf6' },
  { id: 'quick',   icon: '⚡', title: 'Quick Wins',     sub: 'Fast easy rewards',   color: '#06b6d4' },
  { id: 'ads',     icon: '🎬', title: 'Bonus Ads',      sub: 'Watch & earn',        color: '#f59e0b' },
  { id: 'invite',  icon: '🎁', title: 'Invite Friends', sub: 'Unlimited referrals', color: '#22c55e' },
  { id: 'profile', icon: '👤', title: 'My Profile',     sub: 'Stats & levels',      color: '#ec4899' },
];

// ============================================================
// TASKS
// ============================================================
const TASKS = [
  // ---- DAILY ----
  { id: 'd_checkin', cat: 'daily', icon: '✅', title: 'Daily Check-in',  desc: 'One tap, resets every 24 hours', reward: 15, type: 'instant', daily: true },
  { id: 'd_open',    cat: 'daily', icon: '🚀', title: 'Open the App',    desc: 'Just tap to claim',              reward: 5,  type: 'instant', daily: true },
  { id: 'd_browse',  cat: 'daily', icon: '👀', title: 'Browse 30 sec',   desc: 'Keep the app open 30 seconds',   reward: 10, type: 'timer',   seconds: 30, daily: true },

  // ---- TIMERS ----
  { id: 'tm_30',  cat: 'timers', icon: '⏱️', title: 'Stay 30 seconds', desc: 'Short wait, quick NL',       reward: 25,  type: 'timer', seconds: 30 },
  { id: 'tm_60',  cat: 'timers', icon: '⏳', title: 'Stay 60 seconds', desc: 'Longer wait, bigger reward', reward: 50,  type: 'timer', seconds: 60 },
  { id: 'tm_120', cat: 'timers', icon: '🕐', title: 'Stay 2 minutes',  desc: 'Big reward, longest wait',   reward: 100, type: 'timer', seconds: 120 },

  // ---- QUICK WINS ----
  { id: 'qw_about', cat: 'quick', icon: '📖', title: 'Read About page',   desc: 'Open and read the policy',   reward: 20, type: 'link',    url: '/api/about',              wait: 5 },
  { id: 'qw_web',   cat: 'quick', icon: '🌐', title: 'Visit our website', desc: 'Open site, then come back',  reward: 25, type: 'link',    url: 'https://telegram.org',    wait: 5 },
  { id: 'qw_share', cat: 'quick', icon: '📤', title: 'Share NooLimit',    desc: 'Share the bot with a friend',reward: 30, type: 'instant', daily: true },
  { id: 'qw_rate',  cat: 'quick', icon: '⭐', title: 'Rate the bot',      desc: 'Send us your feedback',      reward: 35, type: 'instant', daily: true },

  // ---- ADS ----
  { id: 'ad_1', cat: 'ads', icon: '🎬', title: 'Watch Bonus Ad', desc: 'Optional rewarded ad', reward: 25, type: 'cooldown', cooldown: 90 },
  { id: 'ad_2', cat: 'ads', icon: '🎥', title: 'Watch Extra Ad', desc: 'Another short ad',     reward: 25, type: 'cooldown', cooldown: 180 },
];

// ---------- Task status ----------
function taskStatus(user, t) {
  const s = user.tasks[t.id] || { count: 0, lastAt: 0 };
  const now = Date.now();
  const DAY = 86400000;

  if (t.type === 'timer') {
    if (t.daily) {
      const elapsed = now - (s.lastAt || 0);
      const ready = elapsed >= DAY;
      return { done: false, ready, nextAt: ready ? 0 : s.lastAt + DAY };
    }
    const done = s.count > 0;
    return { done, ready: !done, nextAt: 0 };
  }
  if (t.type === 'link') {
    const done = s.count > 0;
    return { done, ready: !done, nextAt: 0 };
  }
  if (t.type === 'instant') {
    if (t.daily) {
      const elapsed = now - (s.lastAt || 0);
      const ready = elapsed >= DAY;
      return { done: false, ready, nextAt: ready ? 0 : s.lastAt + DAY };
    }
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

// ============================================================
// BOT
// ============================================================
async function handleBot(update) {
  const msg = update.message || update.callback_query?.message;
  const from = update.message?.from || update.callback_query?.from;
  if (!msg || !from) return;

  const chatId = msg.chat.id;
  const text = (update.message?.text || '').trim();
  const cmd = text.split(' ')[0].toLowerCase();
  const WEBAPP_URL = process.env.WEBAPP_URL || 'https://nolimitapp.netlify.app';
  const user = await getOrCreate(from);

  const launchBtn = {
    inline_keyboard: [[{ text: `🚀  Launch ${APP_NAME}`, web_app: { url: WEBAPP_URL } }]],
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
        `👋 *Welcome to ${APP_NAME}*, ${from.first_name}!\n\n` +
        `💠 *What you can do:*\n` +
        `📅  Daily tasks — reset every 24h\n` +
        `⏱️  Timed rewards — wait & earn\n` +
        `⚡  Quick wins — fast NL\n` +
        `🎬  Bonus ads — optional, always\n` +
        `🎁  Invite friends — unlimited NL\n` +
        `👤  Profile & levels — track progress\n\n` +
        `_NL is an in-app token with no cash value._\n\n` +
        `Tap the button below to launch 👇`,
      parse_mode: 'Markdown',
      reply_markup: launchBtn,
    });
  }

  if (cmd === '/balance') {
    return tg('sendMessage', {
      chat_id: chatId,
      text: `💰 *Balance:* ${user.balance} NL\n🏆 *Level:* ${user.level}\n⚡ *XP:* ${user.xp}`,
      parse_mode: 'Markdown',
      reply_markup: launchBtn,
    });
  }

  if (cmd === '/invite') {
    const link = `https://t.me/${BOT_USERNAME}?start=ref_${from.id}`;
    return tg('sendMessage', {
      chat_id: chatId,
      text: `🎁 *Your invite link:*\n\`${link}\`\n\n+50 NL per friend. Unlimited.`,
      parse_mode: 'Markdown',
    });
  }

  if (cmd === '/help') {
    return tg('sendMessage', {
      chat_id: chatId,
      text:
        `*${APP_NAME} Commands*\n\n` +
        `/start – Register\n/balance – Check balance\n/invite – Referral link\n` +
        `/tasks – Open the app\n/help – Menu\n\n` +
        `_NL has no monetary value._`,
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
// API
// ============================================================
async function handleTasks(body) {
  if (!process.env.BOT_TOKEN) return { status: 500, data: { error: 'Server not configured' } };
  const u = verifyInitData(body.initData, process.env.BOT_TOKEN);
  if (!u) return { status: 403, data: { error: 'Invalid auth — reopen from Telegram' } };

  const user = await getOrCreate(u);
  const action = body.action;

  if (action === 'list') {
    const tasks = TASKS.map(t => ({ ...t, ...taskStatus(user, t), count: (user.tasks[t.id]?.count) || 0 }));
    return { status: 200, data: { features: FEATURES, tasks, user: publicUser(user) } };
  }

  if (action === 'complete') {
    const t = TASKS.find(x => x.id === body.taskId);
    if (!t) return { status: 404, data: { error: 'Unknown task' } };

    if (t.type === 'timer') {
      const elapsed = Number(body.elapsed || 0);
      const req = t.seconds || 30;
      if (elapsed < req) return { status: 400, data: { error: `Wait ${req}s first.` } };
    }
    if (t.type === 'link') {
      const elapsed = Number(body.elapsed || 0);
      const req = t.wait || 5;
      if (elapsed < req) return { status: 400, data: { error: `Wait ${req}s first.` } };
    }

    const s = taskStatus(user, t);
    if (!s.ready) return { status: 429, data: { error: 'Not ready yet', nextAt: s.nextAt } };

    const now = Date.now();
    const cur = user.tasks[t.id] || { count: 0, lastAt: 0 };
    cur.count += 1; cur.lastAt = now;
    user.tasks[t.id] = cur;

    user.balance += t.reward;
    user.xp += t.reward;
    user.level = Math.floor(user.xp / 500) + 1;
    await saveUser(user.id, user);
    return { status: 200, data: { ok: true, user: publicUser(user), reward: t.reward } };
  }

  if (action === 'profile') return { status: 200, data: { user: publicUser(user) } };
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
<meta name="theme-color" content="#0b0e14" />
<title>${APP_NAME}</title>
<link rel="icon" type="image/jpeg" href="${LOGO_URL}" />
<link rel="apple-touch-icon" href="${LOGO_URL}" />
<script src="https://telegram.org/js/telegram-web-app.js"><\/script>
<style>
:root{--bg:#0b0e14;--card:#141924;--card2:#1a2030;--line:#232a3b;--text:#eef2ff;--muted:#8f9bb3;--blue:#3b82f6;--blue2:#60a5fa;--green:#22c55e;--gold:#facc15}
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
html,body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Roboto,sans-serif;min-height:100vh}
body{background:radial-gradient(1000px 500px at 50% -10%,rgba(59,130,246,.16),transparent 60%),var(--bg);padding:14px 14px calc(20px + env(safe-area-inset-bottom));padding-top:calc(14px + env(safe-area-inset-top))}
.screen{max-width:520px;margin:0 auto}.hidden{display:none!important}
.loader-wrap,.blocked-wrap{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:75vh;text-align:center;gap:16px;padding:24px}
.loader-wrap img,.blocked-wrap img{width:88px;height:88px;border-radius:22px;object-fit:cover;box-shadow:0 10px 40px rgba(59,130,246,.35)}
.spinner{width:42px;height:42px;border:3px solid rgba(255,255,255,.08);border-top-color:var(--blue);border-radius:50%;animation:spin .9s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.loader-wrap p,.blocked-wrap p{color:var(--muted);max-width:320px;line-height:1.5}

.header{display:flex;align-items:center;gap:12px;margin-bottom:16px}
.header img{width:46px;height:46px;border-radius:13px;object-fit:cover;box-shadow:0 0 0 2px rgba(59,130,246,.35),0 8px 22px rgba(0,0,0,.4)}
.header .who{flex:1;min-width:0}
.header h1{font-size:19px;font-weight:800;line-height:1}
.header small{display:block;color:var(--muted);font-size:12px;margin-top:4px}
.pill{background:linear-gradient(135deg,var(--blue),var(--blue2));padding:6px 12px;border-radius:999px;font-size:12px;font-weight:700;color:#fff;white-space:nowrap}

.hero{background:linear-gradient(135deg,rgba(59,130,246,.18),rgba(96,165,250,.06));border:1px solid rgba(59,130,246,.25);border-radius:18px;padding:20px;margin-bottom:16px;position:relative;overflow:hidden}
.hero::before{content:"";position:absolute;top:-40px;right:-40px;width:140px;height:140px;background:radial-gradient(circle,rgba(59,130,246,.35),transparent 70%);border-radius:50%}
.hero .lbl{font-size:11px;color:var(--blue2);font-weight:700;text-transform:uppercase;letter-spacing:1.2px;position:relative}
.hero .amt{font-size:40px;font-weight:800;letter-spacing:-1px;line-height:1;margin:8px 0 4px;position:relative}
.hero .amt small{font-size:14px;font-weight:600;color:var(--muted);margin-left:6px}
.hero .row{display:flex;gap:16px;margin-top:12px;font-size:12px;color:var(--muted);position:relative}
.hero .row b{color:var(--text);font-weight:700}

.section-title{font-size:13px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin:20px 4px 10px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.tile{background:linear-gradient(160deg,var(--card),var(--card2));border:1px solid var(--line);border-radius:16px;padding:16px;cursor:pointer;transition:.15s;position:relative;overflow:hidden;text-align:left}
.tile:active{transform:scale(.97)}
.tile .ic{width:40px;height:40px;border-radius:12px;background:rgba(255,255,255,.05);display:flex;align-items:center;justify-content:center;font-size:22px;margin-bottom:12px}
.tile .tt{font-size:14px;font-weight:800;margin-bottom:3px}
.tile .sb{font-size:11px;color:var(--muted);line-height:1.3}
.tile .badge{position:absolute;top:14px;right:14px;background:var(--green);color:#072;padding:3px 8px;border-radius:999px;font-size:10px;font-weight:800}

.back-bar{display:flex;align-items:center;gap:12px;margin-bottom:16px}
.back{width:40px;height:40px;border:none;background:var(--card);border:1px solid var(--line);border-radius:12px;color:var(--text);font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center}
.back:active{transform:scale(.94)}
.back-bar h2{font-size:18px;font-weight:800}
.back-bar small{display:block;color:var(--muted);font-size:12px;margin-top:2px}

.task{background:linear-gradient(160deg,var(--card),var(--card2));border:1px solid var(--line);border-radius:14px;padding:14px;display:flex;align-items:center;gap:12px;margin-bottom:10px;position:relative;overflow:hidden}
.task::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:linear-gradient(180deg,var(--blue),var(--blue2))}
.task.ready::before{background:linear-gradient(180deg,var(--green),#4ade80)}
.task.done{opacity:.55}
.task .ic{width:42px;height:42px;border-radius:12px;background:rgba(59,130,246,.14);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0}
.task.ready .ic{background:rgba(34,197,94,.15)}
.task .body{flex:1;min-width:0}
.task .tt{font-size:14px;font-weight:700;margin-bottom:2px}
.task .ds{font-size:11.5px;color:var(--muted);line-height:1.4}
.task .mt{font-size:11px;color:var(--gold);font-weight:700;margin-top:5px}
.task .btn{padding:9px 14px;border:none;border-radius:10px;background:linear-gradient(135deg,var(--blue),var(--blue2));color:#fff;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;min-width:82px;text-align:center}
.task .btn:active{transform:scale(.95)}
.task .btn:disabled{background:#232a3b;color:var(--muted);cursor:default}
.task .btn.done{background:rgba(34,197,94,.15);color:var(--green)}
.task .btn.locked{background:rgba(143,155,179,.12);color:var(--muted);font-variant-numeric:tabular-nums}

.card{background:linear-gradient(160deg,var(--card),var(--card2));border:1px solid var(--line);border-radius:16px;padding:18px;margin-bottom:12px}
.card h2{font-size:16px;font-weight:800;margin-bottom:8px}
.card p{font-size:13px;color:var(--muted);line-height:1.55;margin-bottom:14px}
.btn-primary{width:100%;padding:14px;border:none;border-radius:12px;background:linear-gradient(135deg,var(--blue),var(--blue2));color:#fff;font-size:14px;font-weight:700;cursor:pointer;text-decoration:none;display:block;text-align:center}
.btn-primary:active{transform:scale(.98)}
.invite-box{background:#0a0d14;border:1px dashed var(--line);border-radius:12px;padding:12px;font-size:11.5px;color:var(--blue2);word-break:break-all;text-align:center;margin:10px 0;font-family:ui-monospace,Menlo,monospace}
.profile-row{display:flex;justify-content:space-between;padding:11px 0;border-bottom:1px solid var(--line);font-size:13px}
.profile-row:last-child{border-bottom:none}
.profile-row span:first-child{color:var(--muted)}
.profile-row span:last-child{font-weight:700}
.notice{font-size:11px;color:var(--muted);text-align:center;margin-top:16px;line-height:1.5;opacity:.7}

.modal{position:fixed;inset:0;background:rgba(0,0,0,.8);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:20px;z-index:1000}
.modal .box{background:linear-gradient(160deg,#141924,#1a2030);border:1px solid var(--line);border-radius:18px;padding:24px;max-width:360px;width:100%;text-align:center}
.modal .box h3{font-size:17px;font-weight:800;margin-bottom:8px}
.modal .box p{font-size:13px;color:var(--muted);line-height:1.5;margin-bottom:16px}
.timer-text{font-size:44px;font-weight:800;color:var(--blue2);font-variant-numeric:tabular-nums;margin:8px 0}
.progress{height:8px;background:#0a0d14;border-radius:999px;overflow:hidden;margin:0 0 18px;border:1px solid var(--line)}
.progress .bar{height:100%;background:linear-gradient(90deg,var(--blue),var(--blue2));border-radius:999px;width:0%;transition:width .5s linear}
.modal-btns{display:flex;gap:8px}
.modal-btns button{flex:1;padding:12px;border:none;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer}
.modal-btns .ok{background:linear-gradient(135deg,var(--blue),var(--blue2));color:#fff}
.modal-btns .ok:disabled{opacity:.5;cursor:default}
.modal-btns .cancel{background:#232a3b;color:var(--text)}

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
  <h1 style="font-size:22px">Telegram Only</h1>
  <p>${APP_NAME} is a Telegram Mini App. It only opens inside the Telegram app.</p>
  <a href="https://t.me/${BOT_USERNAME}" class="btn-primary" style="max-width:260px">Open @${BOT_USERNAME}</a>
</div>

<div id="app" class="screen hidden">
  <div id="homeView">
    <div class="header">
      <img src="${LOGO_URL}" />
      <div class="who">
        <h1>${APP_NAME}</h1>
        <small id="greeting">Welcome</small>
      </div>
      <div class="pill" id="levelPill">Lv 1</div>
    </div>

    <div class="hero">
      <div class="lbl">Total Balance</div>
      <div class="amt"><span id="balance">0</span><small>NL</small></div>
      <div class="row">
        <div>⚡ XP <b id="xp">0</b></div>
        <div>🔥 Streak <b id="streak">0</b></div>
        <div>🎁 Invites <b id="refs">0</b></div>
      </div>
    </div>

    <div class="section-title">Earn NL</div>
    <div class="grid" id="featureGrid"></div>

    <div class="notice">NL is an in-app progression token only.<br>No cash value · No withdrawals · Entertainment only.</div>
  </div>

  <div id="detailView" class="hidden">
    <div class="back-bar">
      <button class="back" id="backBtn">←</button>
      <div>
        <h2 id="detailTitle">Feature</h2>
        <small id="detailSub">Description</small>
      </div>
    </div>
    <div id="detailContent"></div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
const tg = window.Telegram?.WebApp;
const initData = tg?.initData;
const $ = (id) => document.getElementById(id);
const screen = (el) => { document.querySelectorAll('.screen').forEach(s=>s.classList.add('hidden')); el.classList.remove('hidden'); };

let USER = null, TASKS = [], FEATURES = [], CURRENT_FEATURE = null;
setInterval(tick, 1000);

function toast(msg, type='') {
  const t = $('toast'); t.textContent = msg; t.className = 'toast show ' + type;
  clearTimeout(toast._t);
  toast._t = setTimeout(()=>t.className='toast '+type, 2400);
}
function fmt(ms) {
  if (ms <= 0) return 'Ready';
  const s = Math.floor(ms/1000);
  if (s < 60) return s + 's';
  const m = Math.floor(s/60), h = Math.floor(m/60);
  if (h > 0) return h + 'h ' + (m%60) + 'm';
  return m + 'm';
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
  $('refs').textContent = u.referrals || 0;
  $('levelPill').textContent = 'Lv ' + u.level;
  $('greeting').textContent = 'Hi ' + (u.first_name || 'there') + ' 👋';
}

function renderFeatures() {
  const grid = $('featureGrid');
  grid.innerHTML = '';
  FEATURES.forEach(f => {
    const readyCount = TASKS.filter(t => t.cat === f.id && t.ready).length;
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.innerHTML =
      (readyCount > 0 ? '<span class="badge">' + readyCount + ' ready</span>' : '') +
      '<div class="ic" style="color:' + f.color + '">' + f.icon + '</div>' +
      '<div class="tt">' + f.title + '</div>' +
      '<div class="sb">' + f.sub + '</div>';
    tile.onclick = () => openFeature(f);
    grid.appendChild(tile);
  });
}

function openFeature(f) {
  CURRENT_FEATURE = f;
  $('homeView').classList.add('hidden');
  $('detailView').classList.remove('hidden');
  $('detailTitle').textContent = f.title;
  $('detailSub').textContent = f.sub;

  const c = $('detailContent');
  c.innerHTML = '';

  if (f.id === 'invite') {
    c.innerHTML =
      '<div class="card">' +
        '<h2>🎁 Invite Friends</h2>' +
        '<p>Unlimited referrals. You get <b>+50 NL</b>, they get <b>+25 NL</b>. No cap.</p>' +
        '<div class="invite-box" id="inviteLink">Tap below to generate…</div>' +
        '<button class="btn-primary" id="copyInvite">📋 Copy invite link</button>' +
      '</div>';
    $('copyInvite').onclick = async () => {
      const link = 'https://t.me/${BOT_USERNAME}?start=ref_' + USER.id;
      $('inviteLink').textContent = link;
      try { navigator.clipboard.writeText(link); } catch {}
      tg?.showAlert?.('Link copied!');
    };
    return;
  }

  if (f.id === 'profile') {
    const totalTasks = Object.values(USER.tasks || {}).reduce((a,t)=>a+(t.count||0),0);
    c.innerHTML =
      '<div class="card">' +
        '<h2>👤 Profile</h2>' +
        '<div class="profile-row"><span>Name</span><span>' + (USER.first_name || '—') + '</span></div>' +
        '<div class="profile-row"><span>Username</span><span>' + (USER.username ? '@'+USER.username : '—') + '</span></div>' +
        '<div class="profile-row"><span>Balance</span><span>' + USER.balance + ' NL</span></div>' +
        '<div class="profile-row"><span>Level</span><span>' + USER.level + '</span></div>' +
        '<div class="profile-row"><span>XP</span><span>' + USER.xp + '</span></div>' +
        '<div class="profile-row"><span>Referrals</span><span>' + (USER.referrals || 0) + '</span></div>' +
        '<div class="profile-row"><span>Tasks done</span><span>' + totalTasks + '</span></div>' +
      '</div>' +
      '<div class="card">' +
        '<h2>ℹ️ About</h2>' +
        '<p>${APP_NAME} is an entertainment Mini App. NL has no monetary value.</p>' +
        '<a href="/api/about" class="btn-primary">Read About & Privacy</a>' +
      '</div>';
    return;
  }

  const list = TASKS.filter(t => t.cat === f.id);
  if (!list.length) {
    c.innerHTML = '<div class="card"><p>No tasks in this category yet.</p></div>';
    return;
  }
  list.forEach(t => {
    const cls = t.done ? 'task done' : (t.ready ? 'task ready' : 'task');
    const el = document.createElement('div');
    el.className = cls;
    el.dataset.id = t.id;
    el.innerHTML =
      '<div class="ic">' + (t.done ? '✅' : t.icon) + '</div>' +
      '<div class="body">' +
        '<div class="tt">' + t.title + '</div>' +
        '<div class="ds">' + t.desc + '</div>' +
        '<div class="mt">+' + t.reward + ' NL' + (t.count ? ' · done ' + t.count + 'x' : '') + '</div>' +
      '</div>' +
      '<button class="btn" data-id="' + t.id + '"></button>';
    el.querySelector('button').onclick = () => handleTask(t);
    c.appendChild(el);
    refreshBtn(el.querySelector('button'), t);
  });
}

function refreshBtn(btn, t) {
  if (t.done) { btn.disabled = true; btn.className = 'btn done'; btn.textContent = 'Done'; return; }
  if (t.ready) {
    btn.disabled = false; btn.className = 'btn';
    btn.textContent = t.type === 'timer' ? 'Start' : (t.type === 'link' ? 'Open' : 'Claim');
    return;
  }
  btn.disabled = true; btn.className = 'btn locked';
  btn.textContent = fmt((t.nextAt || 0) - Date.now());
}

async function handleTask(t) {
  if (t.type === 'timer') return runTimer(t);
  if (t.type === 'link')  return runLink(t);
  const r = await api('complete', { taskId: t.id });
  if (r.ok) {
    tg?.HapticFeedback?.notificationOccurred('success');
    toast('+' + r.reward + ' NL', 'success');
    renderUser(r.user);
    await loadAll();
    if (CURRENT_FEATURE) openFeature(CURRENT_FEATURE);
  } else {
    toast(r.error || 'Not available', 'error');
  }
}

function runLink(t) {
  const secs = t.wait || 5;
  let left = secs;
  const start = Date.now();

  // Open the link
  if (t.url?.startsWith('http')) {
    try { tg?.openLink?.(t.url) || window.open(t.url, '_blank'); } catch { window.open(t.url, '_blank'); }
  } else if (t.url?.startsWith('/')) {
    const full = location.origin + t.url;
    try { tg?.openLink?.(full) || window.open(full, '_blank'); } catch { window.open(full, '_blank'); }
  }

  const m = document.createElement('div');
  m.className = 'modal';
  m.innerHTML =
    '<div class="box">' +
      '<h3>' + t.icon + ' ' + t.title + '</h3>' +
      '<p>Link opened. Come back and wait for verification.</p>' +
      '<div class="timer-text" id="lt">' + left + '</div>' +
      '<div class="progress"><div class="bar" id="lb"></div></div>' +
      '<div class="modal-btns">' +
        '<button class="cancel" id="lc">Cancel</button>' +
        '<button class="ok" id="lo" disabled>Verifying…</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(m);
  const bar = m.querySelector('#lb'), tt = m.querySelector('#lt'), ok = m.querySelector('#lo');
  const iv = setInterval(() => {
    left--;
    tt.textContent = Math.max(0, left);
    bar.style.width = ((secs - Math.max(0, left)) / secs * 100) + '%';
    if (left <= 0) {
      clearInterval(iv);
      ok.disabled = false;
      ok.textContent = 'Claim ' + t.reward + ' NL';
      ok.onclick = async () => {
        const elapsed = (Date.now() - start) / 1000;
        const r = await api('complete', { taskId: t.id, elapsed });
        m.remove();
        if (r.ok) {
          tg?.HapticFeedback?.notificationOccurred('success');
          toast('+' + r.reward + ' NL', 'success');
          renderUser(r.user);
          await loadAll();
          if (CURRENT_FEATURE) openFeature(CURRENT_FEATURE);
        } else toast(r.error || 'Failed', 'error');
      };
    }
  }, 1000);
  m.querySelector('#lc').onclick = () => { clearInterval(iv); m.remove(); };
}

function runTimer(t) {
  const secs = t.seconds || 30;
  let left = secs;
  const start = Date.now();
  const m = document.createElement('div');
  m.className = 'modal';
  m.innerHTML =
    '<div class="box">' +
      '<h3>' + t.icon + ' ' + t.title + '</h3>' +
      '<p>Keep this open. Reward unlocks when the timer ends.</p>' +
      '<div class="timer-text" id="tt">' + left + '</div>' +
      '<div class="progress"><div class="bar" id="tb"></div></div>' +
      '<div class="modal-btns">' +
        '<button class="cancel" id="mc">Cancel</button>' +
        '<button class="ok" id="mo" disabled>Verifying…</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(m);
  const bar = m.querySelector('#tb'), tt = m.querySelector('#tt'), ok = m.querySelector('#mo');
  const iv = setInterval(() => {
    left--;
    tt.textContent = Math.max(0, left);
    bar.style.width = ((secs - Math.max(0, left)) / secs * 100) + '%';
    if (left <= 0) {
      clearInterval(iv);
      ok.disabled = false;
      ok.textContent = 'Claim ' + t.reward + ' NL';
      ok.onclick = async () => {
        const elapsed = (Date.now() - start) / 1000;
        const r = await api('complete', { taskId: t.id, elapsed });
        m.remove();
        if (r.ok) {
          tg?.HapticFeedback?.notificationOccurred('success');
          toast('+' + r.reward + ' NL', 'success');
          renderUser(r.user);
          await loadAll();
          if (CURRENT_FEATURE) openFeature(CURRENT_FEATURE);
        } else toast(r.error || 'Failed', 'error');
      };
    }
  }, 1000);
  m.querySelector('#mc').onclick = () => { clearInterval(iv); m.remove(); };
}

function tick() {
  if (!TASKS.length) return;
  let needs = false;
  TASKS.forEach(t => {
    if (!t.done && !t.ready && (t.nextAt || 0) <= Date.now()) { t.ready = true; t.nextAt = 0; needs = true; }
    else if (!t.done && !t.ready) {
      const b = document.querySelector('.task[data-id="' + t.id + '"] .btn');
      if (b) b.textContent = fmt(t.nextAt - Date.now());
    }
  });
  if (needs && CURRENT_FEATURE && !$('detailView').classList.contains('hidden')) {
    openFeature(CURRENT_FEATURE);
  }
}

async function loadAll() {
  const d = await api('list');
  if (d.error) { toast(d.error, 'error'); return false; }
  FEATURES = d.features;
  TASKS = d.tasks;
  renderUser(d.user);
  renderFeatures();
  return true;
}

async function init() {
  if (!initData) return screen($('blocked'));
  tg.ready(); tg.expand();
  try { tg.setHeaderColor?.('#0b0e14'); tg.setBackgroundColor?.('#0b0e14'); } catch {}

  const ok = await loadAll();
  if (!ok) return screen($('blocked'));
  screen($('app'));

  $('backBtn').onclick = () => {
    $('detailView').classList.add('hidden');
    $('homeView').classList.remove('hidden');
    CURRENT_FEATURE = null;
    loadAll();
  };
}
window.addEventListener('load', init);
<\/script>
</body>
</html>`;

const ABOUT = () => `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>About · ${APP_NAME}</title><link rel="icon" href="${LOGO_URL}" />
<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0b0e14;color:#eef2ff;padding:24px;line-height:1.65;max-width:640px;margin:0 auto}
.brand{display:flex;align-items:center;gap:12px;margin-bottom:16px}.brand img{width:56px;height:56px;border-radius:14px}
h1{font-size:22px;margin:0}h2{font-size:15px;margin:20px 0 6px;color:#60a5fa}a{color:#60a5fa}</style></head>
<body><div class="brand"><img src="${LOGO_URL}" /><h1>About ${APP_NAME}</h1></div>
<p>${APP_NAME} is a Telegram Mini App for entertainment. Users complete simple in-app tasks to earn "NL", a virtual progression token used only inside the app.</p>
<h2>Points Policy</h2><p>NL has <b>no monetary value</b>. It cannot be withdrawn, sold, traded, or exchanged for cash, crypto, or goods.</p>
<h2>Advertising</h2><p>${APP_NAME} displays optional rewarded ads. Watching ads is always a choice and never required.</p>
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
    } catch (e) { return json(500, { error: String(e) }); }
  }
  if (path === '/api/debug') {
    return json(200, {
      botTokenSet: !!process.env.BOT_TOKEN,
      adminIdSet: !!process.env.ADMIN_ID,
      webappUrl: process.env.WEBAPP_URL || '(not set)',
      userCount: await userCount(),
      tasksCount: TASKS.length,
      featuresCount: FEATURES.length,
    });
  }
  if (path === '/api/about') return { statusCode: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' }, body: ABOUT() };
  if (path === '/' || path === '/index.html') return { statusCode: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' }, body: HTML() };
  return { statusCode: 404, body: 'Not found' };
};

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
