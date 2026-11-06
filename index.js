// =====================================================================
//  XX bot — index.js
//  npm i discord.js @napi-rs/canvas
//  Optional (for the exact look): put Poppins-Regular.ttf, Poppins-Medium.ttf
//  and Poppins-Bold.ttf inside ./fonts
//  env: TOKEN, OWNER_ID (optional), CONFIG_PATH (optional)
// =====================================================================
const fs = require("fs");
const path = require("path");
const {
  Client, GatewayIntentBits, Partials, Events, PermissionFlagsBits: P,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  AttachmentBuilder, ChannelType, Routes,
} = require("discord.js");
const { createCanvas, GlobalFonts, loadImage } = require("@napi-rs/canvas");

const OWNER_ID = process.env.OWNER_ID || "1005237630113419315";
const PINK = 0xff2d8a;

// ---------------------------------------------------------------------
//  Storage
// ---------------------------------------------------------------------
const DB_PATH = process.env.CONFIG_PATH || path.join(__dirname, "config.json");
let db = { guilds: {}, afk: {} };
try { db = JSON.parse(fs.readFileSync(DB_PATH, "utf8")); } catch {}
db.guilds ||= {};
db.afk ||= {};
let dirty = false;
const save = () => { dirty = true; };
setInterval(() => {
  if (!dirty) return;
  dirty = false;
  try {
    fs.writeFileSync(DB_PATH + ".tmp", JSON.stringify(db, null, 2));
    fs.renameSync(DB_PATH + ".tmp", DB_PATH);
  } catch (e) { console.error("[save]", e.message); }
}, 5000);

const DEFAULTS = () => ({
  prefix: ",", modlog: null, dmOnAction: true, requireReason: false,
  leveling: false, levelChannel: null, levelMessage: "{user} reached level **{level}**",
  levelRewards: {}, xp: {}, cases: [], caseSeq: 0,
  pingOnJoin: { enabled: false, channelId: null, message: "welcome {user}!" },
  sticky: {},
  antiminor: { enabled: false, channels: [], logChannel: null, modRole: null },
  booster: { enabled: false, roleId: null },
});
function G(id) {
  const cur = (db.guilds[id] ||= {});
  for (const [k, v] of Object.entries(DEFAULTS())) if (!(k in cur)) cur[k] = v;
  return cur;
}

// ---------------------------------------------------------------------
//  Help card renderer (canvas)
// ---------------------------------------------------------------------
const FONT_DIR = path.join(__dirname, "fonts");
for (const [file, weight] of [["Poppins-Regular.ttf", "r"], ["Poppins-Medium.ttf", "m"], ["Poppins-Bold.ttf", "b"]]) {
  const p = path.join(FONT_DIR, file);
  if (fs.existsSync(p)) GlobalFonts.registerFromPath(p, "Poppins" + weight);
  else console.warn("[font] MANCANTE:", p);
}
const F = (w, size) => `${size}px ${GlobalFonts.has("Poppins" + w) ? "Poppins" + w : "Arial, Helvetica, sans-serif"}`;

const C = {
  pink: "#ff2d8a", white: "#ffffff", desc: "#8b8b92", head: "#6e6e75",
  foot: "#5f5f66", line: "#2b2b30", top: "#242429", bottom: "#19191c",
};

// [name, args, description]  (names are stored without the prefix)
const PAGE_COUNT = 15;
const PAGES = {
  1: { cat: "Booster", rows: [
    ["booster", "[status|enable|disable|role <@role>]", "booster perks: role + cross-server access (owner only)"],
  ] },
  2: { cat: "General", rows: [
    ["help", "[category|command]", "browse every command"],
  ] },
  3: { cat: "Leveling", rows: [
    ["addxp", "<@user> <amount>", "grant (or, with a negative amount, remove) xp from a member"],
    ["leaderboard", "", "show the server xp leaderboard"],
    ["levelchannel", "<#channel | here>", "choose where level-up messages are sent (`#channel` or `here`)"],
    ["leveling", "[on|off]", "toggle the leveling system on or off for this server"],
    ["levelmessage", "[text | reset]", "customise the level-up announcement ({user} and {level})"],
    ["levelreward", "[add <level> <@role> | remove <level>]", "manage roles awarded at certain levels"],
  ] },
  4: { cat: "Leveling", rows: [
    ["rank", "[user]", "show your (or someone's) level and xp progress"],
    ["resetxp", "<@user | all>", "reset a member's xp, or the whole server with `all`"],
    ["setlevel", "<@user> <level>", "set a member's level (xp progress resets to 0)"],
  ] },
  5: { cat: "Moderation", rows: [
    ["ban", "<@user|id> [reason]", "ban a member (or a user id that isn't in the server)"],
    ["botclear", "", "bulk-delete the last 100 messages sent by bots"],
    ["case", "<id>", "view a moderation case by number"],
    ["cases", "[@user]", "list moderation cases (optionally for one user)"],
    ["clearwarns", "<@user>", "remove all of a member's warnings"],
    ["delwarn", "<id>", "delete a warning (or any case) by number"],
  ] },
  6: { cat: "Moderation", rows: [
    ["hide", "[#channel]", "hide a channel from @everyone"],
    ["kick", "<@user> [reason]", "kick a member from the server"],
    ["lock", "[#channel] [reason]", "stop @everyone from sending messages in a channel"],
    ["lockdown", "[off]", "lock (or unlock) every text channel at once"],
    ["modconfig", "[status|log|dm|reason]", "configure the moderation system"],
    ["modstats", "", "moderator action leaderboard for this server"],
  ] },
  7: { cat: "Moderation", rows: [
    ["slowmode", "<seconds|duration|off>", "set a channel's slowmode (e.g. 10, 30s, 2m, or off)"],
    ["timeout", "<@user> <duration> [reason]", "timeout a member for a duration (e.g. 10m, 2h, 1d)"],
    ["unban", "<id> [reason]", "lift a ban by user id"],
    ["unhide", "[#channel]", "make a hidden channel visible to @everyone again"],
    ["unlock", "[#channel]", "let @everyone send messages in a channel again"],
    ["untimeout", "<@user> [reason]", "remove a member's timeout early"],
  ] },
  8: { cat: "Moderation", rows: [
    ["warn", "<@user> [reason]", "issue a formal warning to a member"],
    ["warnings", "[@user]", "list warnings (optionally for one user)"],
  ] },
  12: { cat: "Safety", rows: [
    ["antiminor", "[status|enable|disable|channel|log|modrole]", "detect & remove self-reported minors (owner only)"],
  ] },
  13: { cat: "Utility", rows: [
    ["afk", "[reason]", "mark yourself as afk."],
    ["avatar", "[@user]", "show a user's avatar (yours if none given)"],
    ["clearsnipes", "", "clear all sniped deletes, edits, and removed reactions"],
    ["editsnipe", "[n]", "show the original text of the last edited message"],
    ["pingonjoin", "[on|off|channel #channel|message <text>]", "ping & welcome new members in a channel when they join"],
    ["prefix", "[new prefix|reset]", "view or change this server's command prefix (owner)"],
  ] },
  15: { cat: "Utility", rows: [
    ["stickymessage", "[#channel] <text|off>", "pin a message to the bottom of a channel; it re-posts after new messages"],
    ["synccategory", "", "sync every channel in this category's permissions with the category"],
  ] },
  14: { cat: "Utility", rows: [
    ["reactionsnipe", "[n]", "show the last reaction removed from a message"],
    ["reload", "[command|all]", "reload commands and events from disk (files changed on disk)"],
    ["setbotbanner", "[image | remove]", "set my banner for THIS server (attach an image)"],
    ["setbotbio", "[text | remove]", "set my bio for THIS server"],
    ["setbotpfp", "[image | remove]", "set my avatar for THIS server (attach an image)"],
    ["snipe", "[n]", "show the last deleted message in this channel"],
  ] },
  // pages 9, 10, 11 (music) are intentionally not included: navigation skips them
};
const VALID_PAGES = Object.keys(PAGES).map(Number).sort((a, b) => a - b);
const CATS = [...new Set(Object.values(PAGES).map((p) => p.cat))];
const firstPageOf = (cat) => Number(Object.keys(PAGES).find((k) => PAGES[k].cat === cat));

function fit(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > max) t = t.slice(0, -1);
  return t + "…";
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function renderHelp(page, prefix) {
  const data = PAGES[page] || { cat: null, rows: [] };
  const rows = data.rows;
  const W = 1920, CX = 52, CY = 52, CW = 1816, L = 156, R = 1764;
  const rowsN = Math.max(rows.length, 1);
  const lastCenter = 390 + (rowsN - 1) * 120;
  const footLine = lastCenter + 97;
  const bottom = footLine + 89;
  const H = bottom + 52;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // card (with shadow)
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 20;
  const grad = ctx.createLinearGradient(0, CY, 0, bottom);
  grad.addColorStop(0, C.top);
  grad.addColorStop(1, C.bottom);
  ctx.fillStyle = grad;
  roundRect(ctx, CX, CY, CW, bottom - CY, 100);
  ctx.fill();
  ctx.restore();

  ctx.textBaseline = "middle";
  ctx.textAlign = "left";

  // eyebrow: ● XX • HELP
  ctx.fillStyle = C.pink;
  ctx.beginPath(); ctx.arc(162, 140, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.head;
  ctx.font = F("m", 30);
  ctx.letterSpacing = "6px";
  ctx.fillText("XX • HELP", 190, 141);
  ctx.letterSpacing = "0px";

  // title
  ctx.fillStyle = C.white;
  ctx.font = F("b", 88);
  ctx.textBaseline = "alphabetic";
  ctx.fillText(data.cat || "Help", L, 264);

  // counter  05 / 15
  ctx.font = F("b", 56);
  const a = String(page).padStart(2, "0"), b = String(PAGE_COUNT);
  const wA = ctx.measureText(a).width, wS = ctx.measureText(" / ").width, wB = ctx.measureText(b).width;
  let x = R - (wA + wS + wB);
  ctx.fillStyle = C.pink; ctx.fillText(a, x, 250); x += wA;
  ctx.fillStyle = "#55555c"; ctx.fillText(" / ", x, 250); x += wS;
  ctx.fillStyle = C.desc; ctx.fillText(b, x, 250);

  // dividers
  ctx.fillStyle = C.line;
  ctx.fillRect(L, 307, R - L, 2);
  ctx.fillRect(L, footLine, R - L, 2);

  // rows
  ctx.textBaseline = "middle";
  if (!rows.length) {
    ctx.fillStyle = C.desc; ctx.font = F("r", 40);
    ctx.fillText("no commands listed on this page yet", L, 390);
  }
  rows.forEach(([name, args, desc], i) => {
    const cy = 390 + i * 120;
    ctx.font = F("b", 52);
    ctx.fillStyle = C.white;
    const n = prefix + name;
    ctx.fillText(n, L, cy + 2);
    const nw = ctx.measureText(n).width;
    if (args) {
      ctx.font = F("r", 38);
      ctx.fillStyle = C.pink;
      const ax = L + nw + 28;
      ctx.fillText(fit(ctx, args, 796 - ax), ax, cy + 4);
    }
    ctx.font = F("r", 40);
    ctx.fillStyle = C.desc;
    ctx.fillText(fit(ctx, desc, R - 856), 856, cy + 4);
  });

  // footer
  ctx.font = F("m", 28);
  ctx.fillStyle = C.foot;
  ctx.letterSpacing = "5px";
  ctx.fillText("USE THE MENU TO SWITCH CATEGORIES", L, footLine + 40);
  ctx.letterSpacing = "0px";
  ctx.textAlign = "right";
  ctx.font = F("r", 32);
  ctx.fillText(prefix + "help", R, footLine + 40);

  return canvas.toBuffer("image/png");
}

// ---------------------------------------------------------------------
//  Settings card renderer (antiminor / modconfig / pingonjoin / booster)
// ---------------------------------------------------------------------
const CMD_DESC = {}, CAT_OF = {};
for (const pg of Object.values(PAGES)) for (const [n, , d] of pg.rows) { CMD_DESC[n] = d; CAT_OF[n] = pg.cat; }

const ago = (ms) => {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  for (const [n, l] of [[31536000, "y"], [2592000, "mo"], [86400, "d"], [3600, "h"], [60, "m"]]) if (s >= n) return Math.floor(s / n) + l + " ago";
  return "just now";
};
// turns mentions / timestamps / emojis into readable text (canvas can't render them)
async function plain(m, text) {
  const t = String(text ?? "");
  const ids = new Set([...t.matchAll(/<@!?(\d+)>/g)].map((x) => x[1]));
  const names = {};
  await Promise.all([...ids].map(async (id) => {
    const u = await m.client.users.fetch(id).catch(() => null);
    names[id] = u ? u.username : "unknown user";
  }));
  return t
    .replace(/<@!?(\d+)>/g, (_, id) => "@" + names[id])
    .replace(/<@&(\d+)>/g, (_, id) => "@" + (m.guild?.roles.cache.get(id)?.name ?? "unknown role"))
    .replace(/<#(\d+)>/g, (_, id) => "#" + (m.guild?.channels.cache.get(id)?.name ?? "unknown"))
    .replace(/<a?:(\w+):\d+>/g, ":$1:")
    .replace(/<t:(\d+):R>/g, (_, x) => ago(x * 1000))
    .replace(/<t:(\d+)(?::[a-zA-Z])?>/g, (_, x) => new Date(x * 1000).toUTCString().slice(5, 22) + " UTC")
    .replace(/`/g, "");
}

// Generic card:  { eyebrow, title, badge, tone, icon, iconUrl, blocks | fields, footL, footR }
// blocks: {label,value} | {row:[left,right]} | {text, white?, maxLines?} | {image,size}
async function renderCard(o) {
  const W = 1920, CX = 52, CY = 52, CW = 1816, L = 156, R = 1764;
  const hasIcon = !!(o.iconUrl || o.icon);
  const blocks = o.blocks || (o.fields || []).map(([label, value]) => ({ label, value }));
  const meas = createCanvas(10, 10).getContext("2d");

  const wrap = (text, maxW, maxLines, size) => {
    const lines = [];
    for (const para of String(text ?? "").split("\n")) {
      const toks = [];
      for (const sg of para.split(/(\*\*[^*]+\*\*)/).filter(Boolean)) {
        const bold = sg.length > 4 && sg.startsWith("**") && sg.endsWith("**");
        for (const w of (bold ? sg.slice(2, -2) : sg).split(/\s+/)) if (w) toks.push({ t: w, bold });
      }
      meas.font = F("r", size);
      const sp = meas.measureText(" ").width;
      let line = [], x = 0;
      for (const tk of toks) {
        meas.font = F(tk.bold ? "b" : "r", size);
        let w = meas.measureText(tk.t).width;
        if (w > maxW) { tk.t = fit(meas, tk.t, maxW); w = meas.measureText(tk.t).width; }
        if (line.length && x + sp + w > maxW) { lines.push(line); line = []; x = 0; }
        if (line.length) x += sp;
        line.push({ ...tk, x, w }); x += w;
      }
      lines.push(line);
    }
    if (lines.length > maxLines) {
      lines.length = maxLines;
      const last = lines[maxLines - 1], e = last[last.length - 1];
      last.push({ t: "…", bold: false, x: e ? e.x + e.w + 4 : 0, w: 20 });
    }
    return lines;
  };

  // ---- layout
  let y = hasIcon ? 525 : 390, endY = y;
  const placed = [];
  for (const b of blocks) {
    if (b.label !== undefined) {
      const lines = wrap(b.value, R - L, 3, 40);
      placed.push({ b, y, lines }); endY = y + 49 + (lines.length - 1) * 56; y += 91 + 49 + (lines.length - 1) * 56;
    } else if (b.row) {
      placed.push({ b, y }); endY = y; y += 100;
    } else if (b.image) {
      const sz = b.size || 900;
      placed.push({ b, y, sz }); endY = y - 20 + sz + 10; y += sz + 40;
    } else {
      const lines = wrap(b.text, R - L, b.maxLines || 8, 44);
      placed.push({ b, y, lines }); endY = y + (lines.length - 1) * 64; y += lines.length * 64 + 36;
    }
  }
  const footLine = endY + 85;
  const bottom = footLine + 87;
  const H = bottom + 52;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // card + shadow
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 60; ctx.shadowOffsetY = 20;
  const grad = ctx.createLinearGradient(0, CY, 0, bottom);
  grad.addColorStop(0, C.top); grad.addColorStop(1, C.bottom);
  ctx.fillStyle = grad; roundRect(ctx, CX, CY, CW, bottom - CY, 100); ctx.fill();
  ctx.restore();
  // pink glow
  ctx.save();
  roundRect(ctx, CX, CY, CW, bottom - CY, 100); ctx.clip();
  const gh = Math.min(520, bottom - CY);
  const glow = ctx.createLinearGradient(0, CY, 0, CY + gh);
  glow.addColorStop(0, "rgba(255,45,138,0.22)"); glow.addColorStop(1, "rgba(255,45,138,0)");
  ctx.fillStyle = glow; ctx.fillRect(CX, CY, CW, gh);
  ctx.restore();

  ctx.textAlign = "left"; ctx.textBaseline = "middle";

  // badge
  if (o.badge) {
    ctx.font = F("b", 24); ctx.letterSpacing = "3px";
    const tw = ctx.measureText(o.badge).width, bw = tw + 56, bh = 54, bx = R - bw, by = 96;
    ctx.fillStyle = o.tone === "err" ? "#4a2230" : "#3b3b41"; roundRect(ctx, bx, by, bw, bh, 27); ctx.fill();
    ctx.fillStyle = o.tone === "err" ? "#ff7aa8" : "#d0d0d5"; ctx.fillText(o.badge, bx + 28, by + bh / 2 + 2);
    ctx.letterSpacing = "0px";
  }

  let divY;
  if (hasIcon) {
    const IX = L, IY = 227, IS = 174;
    ctx.fillStyle = "#2e2e33"; roundRect(ctx, IX, IY, IS, IS, 42); ctx.fill();
    ctx.strokeStyle = "#3d3d43"; ctx.lineWidth = 2; ctx.stroke();
    let drew = false;
    if (o.iconUrl) {
      try {
        const img = await loadImage(o.iconUrl);
        ctx.save(); roundRect(ctx, IX, IY, IS, IS, 42); ctx.clip(); ctx.drawImage(img, IX, IY, IS, IS); ctx.restore(); drew = true;
      } catch {}
    }
    if (!drew) {
      ctx.fillStyle = "#d6d6db"; ctx.font = F("b", 76); ctx.textAlign = "center";
      ctx.fillText((o.icon || o.title || "?")[0].toUpperCase(), IX + IS / 2, IY + IS / 2 + 4); ctx.textAlign = "left";
    }
    ctx.fillStyle = C.pink; ctx.beginPath(); ctx.arc(372, 281, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.head; ctx.font = F("m", 26); ctx.letterSpacing = "5px";
    ctx.fillText(o.eyebrow.toUpperCase(), 401, 282); ctx.letterSpacing = "0px";
    ctx.fillStyle = C.white; ctx.font = F("b", 68);
    ctx.fillText(fit(ctx, o.title, R - 366), 366, 348);
    divY = 446;
  } else {
    ctx.fillStyle = C.pink; ctx.beginPath(); ctx.arc(162, 140, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.head; ctx.font = F("m", 30); ctx.letterSpacing = "6px";
    ctx.fillText(o.eyebrow.toUpperCase(), 190, 141); ctx.letterSpacing = "0px";
    ctx.fillStyle = C.white; ctx.font = F("b", 88); ctx.textBaseline = "alphabetic";
    ctx.fillText(fit(ctx, o.title, R - L), L, 264); ctx.textBaseline = "middle";
    divY = 307;
  }
  ctx.fillStyle = C.line; ctx.fillRect(L, divY, R - L, 2);

  // body
  for (const { b, y: by, lines, sz } of placed) {
    if (b.label !== undefined) {
      ctx.font = F("m", 24); ctx.letterSpacing = "4px"; ctx.fillStyle = C.foot;
      ctx.fillText(String(b.label).toUpperCase(), L, by); ctx.letterSpacing = "0px";
      lines.forEach((ln, i) => { for (const tk of ln) { ctx.font = F(tk.bold ? "b" : "r", 40); ctx.fillStyle = C.white; ctx.fillText(tk.t, L + tk.x, by + 49 + i * 56); } });
    } else if (b.row) {
      ctx.font = F("b", 44); ctx.fillStyle = C.white;
      const lt = fit(ctx, b.row[0], 760); ctx.fillText(lt, L, by);
      const lw = ctx.measureText(lt).width;
      ctx.font = F("r", 38); ctx.fillStyle = C.desc; ctx.textAlign = "right";
      ctx.fillText(fit(ctx, b.row[1] || "", R - L - lw - 60), R, by + 2); ctx.textAlign = "left";
    } else if (b.image) {
      try {
        const img = await loadImage(b.image);
        ctx.save(); roundRect(ctx, L, by - 20, sz, sz, 60); ctx.clip(); ctx.drawImage(img, L, by - 20, sz, sz); ctx.restore();
      } catch {}
    } else {
      lines.forEach((ln, i) => { for (const tk of ln) {
        ctx.font = F(tk.bold ? "b" : "r", 44);
        ctx.fillStyle = tk.bold || b.white ? C.white : C.desc;
        ctx.fillText(tk.t, L + tk.x, by + i * 64);
      } });
    }
  }

  // footer
  ctx.fillStyle = C.line; ctx.fillRect(L, footLine, R - L, 2);
  ctx.font = F("m", 26); ctx.fillStyle = C.foot; ctx.letterSpacing = "3px";
  ctx.fillText((o.footL || "").toUpperCase(), L, footLine + 40); ctx.letterSpacing = "0px";
  ctx.textAlign = "right"; ctx.font = F("r", 32);
  ctx.fillText(o.footR || "", R, footLine + 40);
  return canvas.toBuffer("image/png");
}

async function card(m, o, mode) {
  let buf;
  try { buf = await renderCard(o); } catch (e) { console.error("[card]", e); return null; }
  const payload = { files: [new AttachmentBuilder(buf, { name: "card.png" })], allowedMentions: { parse: [], repliedUser: false } };
  return (mode === "send" ? m.channel.send(payload) : m.reply(payload)).catch((e) => { console.error("[card send]", e.message); return null; });
}
const cmdOf = (m) => {
  try {
    const pre = G(m.guild.id).prefix;
    return (m.content.startsWith(pre) ? m.content.slice(pre.length).trim().split(/\s+/)[0] : "").toLowerCase() || "bot";
  } catch { return "bot"; }
};
async function note(m, good, t, mode) {
  const cmd = cmdOf(m), pre = G(m.guild.id).prefix;
  return card(m, {
    eyebrow: `XX • ${CAT_OF[cmd] || "bot"}`, title: cmd.charAt(0).toUpperCase() + cmd.slice(1),
    badge: good ? "DONE" : "FAILED", tone: good ? null : "err",
    blocks: [{ text: await plain(m, t) }], footL: pre + cmd, footR: m.author.username,
  }, mode);
}
const ok = (m, t, mode) => note(m, true, t, mode);
const err = (m, t, mode) => note(m, false, t, mode);

const sendCard = (m, o) => card(m, { title: m.guild.name, icon: m.guild.name, iconUrl: m.guild.iconURL({ extension: "png", size: 256 }), ...o });
const chLabel = (m, id) => (m.guild.channels.cache.get(id) ? "#" + m.guild.channels.cache.get(id).name : "unknown channel");
const roleLabel = (m, id) => (m.guild.roles.cache.get(id) ? "@" + m.guild.roles.cache.get(id).name : "unknown role");
const userName = async (m, id) => (await m.client.users.fetch(id).catch(() => null))?.username ?? "unknown user";
const avatarOf = (u) => u.displayAvatarURL({ extension: "png", size: 256 });

function helpMessage(page, ownerId, prefix) {
  const file = new AttachmentBuilder(renderHelp(page, prefix), { name: `help-${page}.png` });
  const cat = PAGES[page]?.cat;
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`help:menu:${ownerId}`)
    .setPlaceholder(cat || "Select a category")
    .addOptions(CATS.map((c) => ({ label: c, value: String(firstPageOf(c)) })));
  const idx = Math.max(VALID_PAGES.indexOf(page), 0);
  const prev = VALID_PAGES[(idx - 1 + VALID_PAGES.length) % VALID_PAGES.length];
  const next = VALID_PAGES[(idx + 1) % VALID_PAGES.length];
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`help:go:${ownerId}:${prev}`).setEmoji("◀️").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("help:noop").setLabel(`${page} / ${PAGE_COUNT}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId(`help:go:${ownerId}:${next}`).setEmoji("▶️").setStyle(ButtonStyle.Secondary),
  );
  return { files: [file], components: [new ActionRowBuilder().addComponents(menu), row2] };
}

// ---------------------------------------------------------------------
//  Client
// ---------------------------------------------------------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.GuildModeration,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User],
});

// ---------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------
const embed = (desc) => ({ color: PINK, description: desc });
const usage = (m, p, u) => m.reply({
  content: `\`${p}${u}\`\n${CMD_DESC[u.split(" ")[0]] || ""}`.trim(),
  allowedMentions: { parse: [], repliedUser: false },
}).catch(() => {});

const idOf = (s) => (s || "").replace(/\D/g, "");
async function getMember(m, arg) {
  const id = m.mentions.members.first()?.id ?? idOf(arg);
  return id ? m.guild.members.fetch(id).catch(() => null) : null;
}
async function getUser(m, arg) {
  const id = m.mentions.users.first()?.id ?? idOf(arg);
  return id ? client.users.fetch(id).catch(() => null) : null;
}
const getChannel = (m, arg) => m.mentions.channels.first() ?? (idOf(arg) ? m.guild.channels.cache.get(idOf(arg)) : null);

function dur(s, defUnit = "s") {
  const m = /^(\d+)(s|m|h|d)?$/i.exec(s || "");
  if (!m) return null;
  const u = { s: 1, m: 60, h: 3600, d: 86400 }[(m[2] || defUnit).toLowerCase()];
  return parseInt(m[1], 10) * u * 1000;
}
const fmtDur = (ms) => {
  const s = Math.round(ms / 1000);
  if (s % 86400 === 0) return `${s / 86400}d`;
  if (s % 3600 === 0) return `${s / 3600}h`;
  if (s % 60 === 0) return `${s / 60}m`;
  return `${s}s`;
};

function canAct(m, target) {
  if (target.id === m.author.id) return "you can't do that to yourself";
  if (target.id === m.guild.ownerId) return "you can't do that to the server owner";
  if (m.author.id !== m.guild.ownerId && target.roles.highest.position >= m.member.roles.highest.position)
    return "that member's role is equal to or higher than yours";
  return null;
}

async function record(m, type, user, reason) {
  const g = G(m.guild.id);
  const id = ++g.caseSeq;
  g.cases.push({ id, type, userId: user.id, modId: m.author.id, reason, at: Date.now() });
  save();
  if (g.modlog) {
    const ch = m.guild.channels.cache.get(g.modlog);
    ch?.send({ embeds: [{ color: PINK, title: `case #${id} • ${type}`, fields: [
      { name: "user", value: `${user} (${user.id})`, inline: true },
      { name: "moderator", value: `${m.author}`, inline: true },
      { name: "reason", value: reason.slice(0, 1000) },
    ], timestamp: new Date().toISOString() }] }).catch(() => {});
  }
  return id;
}
async function dmUser(m, user, verb, reason) {
  if (!G(m.guild.id).dmOnAction) return;
  user.send({ embeds: [embed(`you were **${verb}** in **${m.guild.name}**\nreason: ${reason}`)] }).catch(() => {});
}
function reasonOf(m, args, from) {
  const r = args.slice(from).join(" ").trim();
  if (!r && G(m.guild.id).requireReason) return null;
  return r || "no reason provided";
}

// snipes (memory only)
const snipes = { del: new Map(), edit: new Map(), react: new Map() };
const pushSnipe = (map, ch, v) => {
  const a = map.get(ch) || [];
  a.unshift(v);
  map.set(ch, a.slice(0, 10));
};

// leveling math
const need = (l) => 5 * l * l + 50 * l + 100;
const cumulative = (l) => { let t = 0; for (let i = 0; i < l; i++) t += need(i); return t; };
const levelOf = (total) => { let l = 0, t = total; while (t >= need(l)) { t -= need(l); l++; } return { level: l, into: t }; };
const xpOf = (g, uid) => (g.xp[uid] ||= { total: 0, last: 0 });

async function applyRewards(member, g, level) {
  for (const [lvl, roleId] of Object.entries(g.levelRewards)) {
    if (level >= Number(lvl) && !member.roles.cache.has(roleId)) await member.roles.add(roleId).catch(() => {});
  }
}

// anti-minor
function minorCheck(text) {
  const t = text.replace(/<[@#][!&]?\d+>/g, "").replace(/https?:\/\/\S+/g, "").replace(/\b\d[,.]\d+\s*m\b/gi, "");
  if (/\bunderage\b|\bminor\b|\bstill in (high ?school|hs|school)\b/i.test(t)) return "minor keyword";
  const adult = /\b(1[89]|[2-6]\d)\b(?!\s*(cm|kg|lbs?|inch|in\b|'|"))/i.test(t);
  const minor =
    /\b(1[0-7])\s*(m|f|yo|y\/o|years?\s*old|male|female|boy|girl)\b/i.exec(t) ||
    /\b(i'?m|im|aged?)\s*(1[0-7])\b/i.exec(t);
  if (minor && !adult) return `age ${minor[0].trim()}`;
  if (minor && /\b(1[0-7])\s*[mf]\b/i.test(t)) return `age ${minor[0].trim()} (despite adult age)`;
  return null;
}

// ---------------------------------------------------------------------
//  Commands
// ---------------------------------------------------------------------
const cmds = new Map();
const def = (names, perm, fn) => { for (const n of [].concat(names)) cmds.set(n, { perm, fn }); };

// ---- help
def("help", null, async (m, a, p) => {
  const q = (a[0] || "").toLowerCase().replace(p, "");
  const n = parseInt(q, 10);
  if (q && !PAGES[n]) {
    for (const pg of Object.values(PAGES)) {
      const row = pg.rows.find((r) => r[0] === q);
      if (row) return usage(m, p, `${row[0]}${row[1] ? " " + row[1] : ""}`);
    }
    const cat = CATS.find((c) => c.toLowerCase() === q);
    if (cat) return m.reply({ ...helpMessage(firstPageOf(cat), m.author.id, p), allowedMentions: { repliedUser: false } });
  }
  const page = PAGES[n] ? n : 5;
  await m.reply({ ...helpMessage(page, m.author.id, p), allowedMentions: { repliedUser: false } });
});

// ---- moderation
def("ban", P.BanMembers, async (m, a, p) => {
  if (!a[0]) return usage(m, p, "ban <@user|id> [reason]");
  const user = await getUser(m, a[0]);
  if (!user) return err(m, "couldn't find that user");
  const reason = reasonOf(m, a, 1);
  if (!reason) return err(m, "a reason is required");
  const mem = await m.guild.members.fetch(user.id).catch(() => null);
  if (mem) { const e = canAct(m, mem); if (e) return err(m, e); if (!mem.bannable) return err(m, "i can't ban that member"); }
  await dmUser(m, user, "banned", reason);
  const done = await m.guild.members.ban(user.id, { reason: `${m.author.username}: ${reason}` }).catch(() => null);
  if (!done) return err(m, "failed to ban — check my role hierarchy");
  const id = await record(m, "ban", user, reason);
  ok(m, `banned **${user.username}** | ${reason} (case #${id})`);
});

def("unban", P.BanMembers, async (m, a, p) => {
  const id = idOf(a[0]);
  if (!id) return usage(m, p, "unban <id> [reason]");
  const reason = reasonOf(m, a, 1);
  if (!reason) return err(m, "a reason is required");
  const done = await m.guild.bans.remove(id, reason).catch(() => null);
  if (!done) return err(m, "that user isn't banned");
  const user = await client.users.fetch(id).catch(() => ({ id, username: id, toString: () => id }));
  await record(m, "unban", user, reason);
  ok(m, `unbanned **${user.username}**`);
});

def("kick", P.KickMembers, async (m, a, p) => {
  const mem = await getMember(m, a[0]);
  if (!mem) return usage(m, p, "kick <@user> [reason]");
  const e = canAct(m, mem); if (e) return err(m, e);
  const reason = reasonOf(m, a, 1);
  if (!reason) return err(m, "a reason is required");
  await dmUser(m, mem.user, "kicked", reason);
  const done = await mem.kick(`${m.author.username}: ${reason}`).catch(() => null);
  if (!done) return err(m, "failed to kick — check my role hierarchy");
  const id = await record(m, "kick", mem.user, reason);
  ok(m, `kicked **${mem.user.username}** | ${reason} (case #${id})`);
});

def("timeout", P.ModerateMembers, async (m, a, p) => {
  const mem = await getMember(m, a[0]);
  const ms = dur(a[1], "m");
  if (!mem || !ms) return usage(m, p, "timeout <@user> <duration> [reason]");
  if (ms > 28 * 86400000) return err(m, "max timeout is 28d");
  const e = canAct(m, mem); if (e) return err(m, e);
  const reason = reasonOf(m, a, 2);
  if (!reason) return err(m, "a reason is required");
  await dmUser(m, mem.user, `timed out for ${fmtDur(ms)}`, reason);
  const done = await mem.timeout(ms, `${m.author.username}: ${reason}`).catch(() => null);
  if (!done) return err(m, "failed to timeout — check my role hierarchy");
  const id = await record(m, "timeout", mem.user, `${fmtDur(ms)} — ${reason}`);
  ok(m, `timed out **${mem.user.username}** for **${fmtDur(ms)}** | ${reason} (case #${id})`);
});

def("untimeout", P.ModerateMembers, async (m, a, p) => {
  const mem = await getMember(m, a[0]);
  if (!mem) return usage(m, p, "untimeout <@user> [reason]");
  const reason = reasonOf(m, a, 1) ?? "no reason provided";
  await mem.timeout(null, reason).catch(() => null);
  await record(m, "untimeout", mem.user, reason);
  ok(m, `removed timeout from **${mem.user.username}**`);
});

def("warn", P.ModerateMembers, async (m, a, p) => {
  const mem = await getMember(m, a[0]);
  if (!mem) return usage(m, p, "warn <@user> [reason]");
  const e = canAct(m, mem); if (e) return err(m, e);
  const reason = reasonOf(m, a, 1);
  if (!reason) return err(m, "a reason is required");
  const id = await record(m, "warn", mem.user, reason);
  const n = G(m.guild.id).cases.filter((c) => c.type === "warn" && c.userId === mem.id).length;
  await dmUser(m, mem.user, "warned", reason);
  ok(m, `warned **${mem.user.username}** (${n} total) | ${reason} (case #${id})`);
});

def("warnings", null, async (m, a, p) => {
  const user = a[0] ? await getUser(m, a[0]) : null;
  const list = G(m.guild.id).cases.filter((c) => c.type === "warn" && (!user || c.userId === user.id));
  if (!list.length) return ok(m, user ? `**${user.username}** has no warnings` : "no warnings in this server");
  const rows = await Promise.all(list.slice(-15).reverse().map(async (c) => [`#${c.id} · ${await userName(m, c.userId)}`, `${c.reason} · ${ago(c.at)}`]));
  return card(m, { eyebrow: "XX • moderation", title: user ? `Warnings · ${user.username}` : "Warnings", badge: `${list.length} TOTAL`,
    blocks: rows.map((row) => ({ row })), footL: p + "warnings", footR: m.guild.name });
});

def("clearwarns", P.ModerateMembers, async (m, a, p) => {
  const user = await getUser(m, a[0]);
  if (!user) return usage(m, p, "clearwarns <@user>");
  const g = G(m.guild.id);
  const before = g.cases.length;
  g.cases = g.cases.filter((c) => !(c.type === "warn" && c.userId === user.id));
  save();
  ok(m, `removed **${before - g.cases.length}** warnings from **${user.username}**`);
});

def("delwarn", P.ModerateMembers, async (m, a, p) => {
  const id = parseInt(a[0], 10);
  if (!id) return usage(m, p, "delwarn <id>");
  const g = G(m.guild.id);
  const i = g.cases.findIndex((c) => c.id === id);
  if (i < 0) return err(m, `case #${id} not found`);
  g.cases.splice(i, 1);
  save();
  ok(m, `deleted case **#${id}**`);
});

def("case", P.ModerateMembers, async (m, a, p) => {
  const id = parseInt(a[0], 10);
  if (!id) return usage(m, p, "case <id>");
  const c = G(m.guild.id).cases.find((x) => x.id === id);
  if (!c) return err(m, `case #${id} not found`);
  return card(m, { eyebrow: "XX • moderation", title: `Case #${c.id}`, badge: c.type.toUpperCase(), footL: p + "case", footR: m.guild.name, blocks: [
    { label: "User", value: `${await userName(m, c.userId)} (${c.userId})` },
    { label: "Moderator", value: await userName(m, c.modId) },
    { label: "Reason", value: c.reason },
    { label: "Date", value: new Date(c.at).toUTCString().slice(5, 22) + " UTC" },
  ] });
});

def("cases", P.ModerateMembers, async (m, a, p) => {
  const user = a[0] ? await getUser(m, a[0]) : null;
  const list = G(m.guild.id).cases.filter((c) => !user || c.userId === user.id);
  if (!list.length) return ok(m, "no cases found");
  const rows = await Promise.all(list.slice(-15).reverse().map(async (c) => [`#${c.id} · ${c.type}`, `${await userName(m, c.userId)} — ${c.reason.slice(0, 60)}`]));
  return card(m, { eyebrow: "XX • moderation", title: user ? `Cases · ${user.username}` : "Cases", badge: `${list.length} TOTAL`,
    blocks: rows.map((row) => ({ row })), footL: p + "cases", footR: m.guild.name });
});

def("modstats", P.ModerateMembers, async (m, a, p) => {
  const by = {};
  for (const c of G(m.guild.id).cases) { (by[c.modId] ||= { n: 0 }).n++; by[c.modId][c.type] = (by[c.modId][c.type] || 0) + 1; }
  const top = Object.entries(by).sort((x, y) => y[1].n - x[1].n).slice(0, 10);
  if (!top.length) return ok(m, "no moderation actions recorded yet");
  const rows = await Promise.all(top.map(async ([id, st], i) => [`#${i + 1} · ${await userName(m, id)}`, `${st.n} actions · ${st.ban || 0} bans · ${st.kick || 0} kicks · ${st.timeout || 0} timeouts · ${st.warn || 0} warns`]));
  return card(m, { eyebrow: "XX • moderation", title: "Mod stats", blocks: rows.map((row) => ({ row })), footL: p + "modstats", footR: m.guild.name });
});

def("modconfig", P.ManageGuild, async (m, a, p) => {
  const g = G(m.guild.id);
  const sub = (a[0] || "status").toLowerCase();
  const onoff = (v) => ({ on: true, off: false, enable: true, disable: false }[(v || "").toLowerCase()]);
  if (sub === "status") {
    return sendCard(m, { eyebrow: "Moderation settings", footL: p + "modconfig", footR: "moderation", fields: [
      ["Log channel", g.modlog ? chLabel(m, g.modlog) : "not set"],
      ["DM on action", g.dmOnAction ? "on" : "off"],
      ["Require reason", g.requireReason ? "on" : "off"],
    ] });
  }
  if (sub === "log") {
    if ((a[1] || "").toLowerCase() === "off") { g.modlog = null; save(); return ok(m, "mod log disabled"); }
    const ch = getChannel(m, a[1]);
    if (!ch) return usage(m, p, "modconfig log <#channel|off>");
    g.modlog = ch.id; save(); return ok(m, `mod log → ${ch}`);
  }
  if (sub === "dm" || sub === "reason") {
    const v = onoff(a[1]);
    if (v === undefined) return usage(m, p, `modconfig ${sub} <on|off>`);
    if (sub === "dm") g.dmOnAction = v; else g.requireReason = v;
    save(); return ok(m, `${sub === "dm" ? "dm on action" : "require reason"}: **${v ? "on" : "off"}**`);
  }
  usage(m, p, "modconfig [status|log|dm|reason]");
});

// ---- channel control
const everyone = (m) => m.guild.roles.everyone;
const textChannels = (m) => m.guild.channels.cache.filter((c) => c.type === ChannelType.GuildText);

def("lock", P.ManageChannels, async (m, a) => {
  const ch = getChannel(m, a[0]) || m.channel;
  const reason = a.slice(m.mentions.channels.size || idOf(a[0]).length > 15 ? 1 : 0).join(" ") || "no reason provided";
  await ch.permissionOverwrites.edit(everyone(m), { SendMessages: false }, { reason }).catch(() => null);
  ok(m, `locked ${ch} | ${reason}`);
});
def("unlock", P.ManageChannels, async (m, a) => {
  const ch = getChannel(m, a[0]) || m.channel;
  await ch.permissionOverwrites.edit(everyone(m), { SendMessages: null }).catch(() => null);
  ok(m, `unlocked ${ch}`);
});
def("hide", P.ManageChannels, async (m, a) => {
  const ch = getChannel(m, a[0]) || m.channel;
  await ch.permissionOverwrites.edit(everyone(m), { ViewChannel: false }).catch(() => null);
  ok(m, `hidden ${ch}`);
});
def("unhide", P.ManageChannels, async (m, a) => {
  const ch = getChannel(m, a[0]) || m.channel;
  await ch.permissionOverwrites.edit(everyone(m), { ViewChannel: null }).catch(() => null);
  ok(m, `unhidden ${ch}`);
});
def("lockdown", P.Administrator, async (m, a) => {
  const off = (a[0] || "").toLowerCase() === "off";
  const chans = textChannels(m);
  for (const ch of chans.values()) await ch.permissionOverwrites.edit(everyone(m), { SendMessages: off ? null : false }).catch(() => {});
  ok(m, `${off ? "unlocked" : "locked"} **${chans.size}** channels`);
});
def("slowmode", P.ManageChannels, async (m, a, p) => {
  if (!a[0]) return usage(m, p, "slowmode <seconds|duration|off>");
  const ms = a[0].toLowerCase() === "off" ? 0 : dur(a[0], "s");
  if (ms === null || ms > 21600000) return err(m, "invalid value (0 – 6h)");
  await m.channel.setRateLimitPerUser(ms / 1000).catch(() => null);
  ok(m, ms === 0 ? "slowmode disabled" : `slowmode set to **${fmtDur(ms)}**`);
});
def("botclear", P.ManageMessages, async (m) => {
  const msgs = await m.channel.messages.fetch({ limit: 100 });
  const bots = msgs.filter((x) => x.author.bot);
  const del = await m.channel.bulkDelete(bots, true).catch(() => null);
  const r = await ok(m, `deleted **${del?.size ?? 0}** bot messages`, "send");
  setTimeout(() => r?.delete().catch(() => {}), 3000);
});

// ---- leveling
def("leveling", P.ManageGuild, async (m, a) => {
  const g = G(m.guild.id);
  const v = (a[0] || "").toLowerCase();
  if (v === "on") g.leveling = true; else if (v === "off") g.leveling = false; else g.leveling = !g.leveling;
  save();
  ok(m, `leveling **${g.leveling ? "enabled" : "disabled"}**`);
});
def("levelchannel", P.ManageGuild, async (m, a, p) => {
  const g = G(m.guild.id);
  if ((a[0] || "").toLowerCase() === "here") { g.levelChannel = null; save(); return ok(m, "level-ups will be sent in the channel where the member levels up"); }
  const ch = getChannel(m, a[0]);
  if (!ch) return usage(m, p, "levelchannel <#channel | here>");
  g.levelChannel = ch.id; save(); ok(m, `level-up messages → ${ch}`);
});
def("levelmessage", P.ManageGuild, async (m, a) => {
  const g = G(m.guild.id);
  if (!a.length) return ok(m, `current: ${g.levelMessage}`);
  g.levelMessage = a[0].toLowerCase() === "reset" ? DEFAULTS().levelMessage : a.join(" ");
  save(); ok(m, `level-up message set: ${g.levelMessage}`);
});
def("levelreward", P.ManageGuild, async (m, a, p) => {
  const g = G(m.guild.id);
  const sub = (a[0] || "list").toLowerCase();
  if (sub === "add") {
    const lvl = parseInt(a[1], 10), role = m.mentions.roles.first();
    if (!lvl || !role) return usage(m, p, "levelreward add <level> <@role>");
    g.levelRewards[lvl] = role.id; save(); return ok(m, `level **${lvl}** → **${role.name}**`);
  }
  if (sub === "remove") {
    const lvl = parseInt(a[1], 10);
    if (!g.levelRewards[lvl]) return err(m, "no reward at that level");
    delete g.levelRewards[lvl]; save(); return ok(m, `removed reward for level **${lvl}**`);
  }
  const rewards = Object.entries(g.levelRewards).sort((x, y) => x[0] - y[0]);
  return card(m, { eyebrow: "XX • leveling", title: "Level rewards", badge: `${rewards.length} SET`, footL: p + "levelreward", footR: m.guild.name,
    blocks: rewards.length ? rewards.map(([l, r]) => ({ row: [`Level ${l}`, roleLabel(m, r)] })) : [{ text: "none set" }] });
});
def("rank", null, async (m, a) => {
  const g = G(m.guild.id);
  const user = (a[0] ? await getUser(m, a[0]) : null) || m.author;
  const u = xpOf(g, user.id);
  const { level, into } = levelOf(u.total);
  const pos = Object.entries(g.xp).sort((x, y) => y[1].total - x[1].total).findIndex(([id]) => id === user.id) + 1;
  return card(m, { eyebrow: "XX • rank", title: user.username, iconUrl: avatarOf(user), footL: m.guild.name, footR: G(m.guild.id).prefix + "rank", fields: [
    ["Level", `${level}`], ["XP", `${into} / ${need(level)}`], ["Rank", pos ? `#${pos}` : "—"],
  ] });
});
def(["leaderboard", "lb"], null, async (m) => {
  const g = G(m.guild.id);
  const top = Object.entries(g.xp).sort((x, y) => y[1].total - x[1].total).slice(0, 10);
  if (!top.length) return ok(m, "no xp data yet");
  const rows = await Promise.all(top.map(async ([id, u], i) => [`${i + 1}. ${await userName(m, id)}`, `level ${levelOf(u.total).level} · ${u.total} xp`]));
  return card(m, { eyebrow: "XX • leveling", title: "Leaderboard", blocks: rows.map((row) => ({ row })), footL: m.guild.name, footR: G(m.guild.id).prefix + "leaderboard" });
});
def("addxp", P.ManageGuild, async (m, a, p) => {
  const mem = await getMember(m, a[0]);
  const amt = parseInt(a[1], 10);
  if (!mem || isNaN(amt)) return usage(m, p, "addxp <@user> <amount>");
  const u = xpOf(G(m.guild.id), mem.id);
  u.total = Math.max(0, u.total + amt); save();
  ok(m, `${amt >= 0 ? "added" : "removed"} **${Math.abs(amt)}** xp ${amt >= 0 ? "to" : "from"} **${mem.user.username}** (level ${levelOf(u.total).level})`);
});
def("setlevel", P.ManageGuild, async (m, a, p) => {
  const mem = await getMember(m, a[0]);
  const lvl = parseInt(a[1], 10);
  if (!mem || isNaN(lvl) || lvl < 0) return usage(m, p, "setlevel <@user> <level>");
  xpOf(G(m.guild.id), mem.id).total = cumulative(lvl); save();
  ok(m, `set **${mem.user.username}** to level **${lvl}**`);
});
def("resetxp", P.ManageGuild, async (m, a, p) => {
  const g = G(m.guild.id);
  if ((a[0] || "").toLowerCase() === "all") { g.xp = {}; save(); return ok(m, "reset xp for the whole server"); }
  const mem = await getMember(m, a[0]);
  if (!mem) return usage(m, p, "resetxp <@user | all>");
  delete g.xp[mem.id]; save(); ok(m, `reset xp for **${mem.user.username}**`);
});

// ---- safety
def("antiminor", "owner", async (m, a, p) => {
  const g = G(m.guild.id), cfg = g.antiminor;
  const sub = (a[0] || "status").toLowerCase();
  if (sub === "enable") { cfg.enabled = true; save(); return ok(m, "anti-minor **enabled**"); }
  if (sub === "disable") { cfg.enabled = false; save(); return ok(m, "anti-minor **disabled**"); }
  if (sub === "channel") {
    const ch = getChannel(m, a[2] || a[1]);
    const act = (a[1] || "").toLowerCase();
    if (!ch || !["add", "remove"].includes(act)) return usage(m, p, "antiminor channel <add|remove> <#channel>");
    cfg.channels = act === "add" ? [...new Set([...cfg.channels, ch.id])] : cfg.channels.filter((x) => x !== ch.id);
    save(); return ok(m, `${act === "add" ? "now monitoring" : "stopped monitoring"} ${ch}`);
  }
  if (sub === "log") {
    const ch = getChannel(m, a[1]);
    if (!ch) return usage(m, p, "antiminor log <#channel>");
    cfg.logChannel = ch.id; save(); return ok(m, `detections will be logged in ${ch}`);
  }
  if (sub === "modrole") {
    const r = m.mentions.roles.first();
    if (!r) return usage(m, p, "antiminor modrole <@role>");
    cfg.modRole = r.id; save(); return ok(m, `mod role set to **${r.name}**`);
  }
  return sendCard(m, { eyebrow: "Anti-minor settings", badge: cfg.enabled ? "ENABLED" : "DISABLED",
    footL: p + "antiminor", footR: cfg.enabled ? "active" : "paused", fields: [
    ["Log channel", cfg.logChannel ? chLabel(m, cfg.logChannel) : "not set"],
    ["Mod ping", cfg.modRole ? roleLabel(m, cfg.modRole) : "none"],
    ["Watched channels", cfg.channels.map((c) => chLabel(m, c)).join(", ") || "none"],
    ["Media-only channels", cfg.mediaChannels?.length ? cfg.mediaChannels.map((c) => chLabel(m, c)).join(", ") : "none"],
  ] });
});

// ---- utility
def("afk", null, async (m, a) => {
  db.afk[`${m.guild.id}-${m.author.id}`] = { reason: a.join(" ") || "afk", at: Date.now() };
  save();
  ok(m, `you're now afk: **${a.join(" ") || "afk"}**`);
});
def(["avatar", "av"], null, async (m, a) => {
  const user = (a[0] ? await getUser(m, a[0]) : null) || m.author;
  return card(m, { eyebrow: "XX • avatar", title: user.username, footL: G(m.guild.id).prefix + "avatar", footR: m.author.username,
    blocks: [{ image: user.displayAvatarURL({ extension: "png", size: 1024 }), size: 900 }] });
});
def("snipe", null, async (m, a) => {
  const n = Math.max(parseInt(a[0], 10) || 1, 1);
  const s = snipes.del.get(m.channel.id)?.[n - 1];
  if (!s) return err(m, "nothing to snipe");
  return card(m, { eyebrow: "XX • snipe", title: s.author, iconUrl: s.avatar, badge: `${n} / ${snipes.del.get(m.channel.id).length}`,
    blocks: [{ text: await plain(m, s.content || "(no text)"), white: true }], footL: G(m.guild.id).prefix + "snipe", footR: ago(s.at) });
});
def(["reactionsnipe", "rsnipe"], null, async (m, a) => {
  const n = Math.max(parseInt(a[0], 10) || 1, 1);
  const s = snipes.react.get(m.channel.id)?.[n - 1];
  if (!s) return err(m, "nothing to snipe");
  return card(m, { eyebrow: "XX • reaction snipe", title: "Reaction removed", badge: `${n} / ${snipes.react.get(m.channel.id).length}`,
    blocks: [{ text: await plain(m, `**${s.user?.username ?? s.user}** removed **${s.emoji}**`) }], footL: G(m.guild.id).prefix + "reactionsnipe", footR: ago(s.at) });
});
def(["editsnipe", "esnipe"], null, async (m, a) => {
  const n = Math.max(parseInt(a[0], 10) || 1, 1);
  const s = snipes.edit.get(m.channel.id)?.[n - 1];
  if (!s) return err(m, "nothing to snipe");
  return card(m, { eyebrow: "XX • edit snipe", title: s.author, iconUrl: s.avatar, badge: `${n} / ${snipes.edit.get(m.channel.id).length}`,
    blocks: [{ text: await plain(m, s.before || "(no text)"), white: true }], footL: G(m.guild.id).prefix + "editsnipe", footR: ago(s.at) });
});
def("clearsnipes", P.ManageMessages, async (m) => {
  for (const map of Object.values(snipes)) map.delete(m.channel.id);
  ok(m, "cleared all snipes in this channel");
});
def("pingonjoin", P.ManageGuild, async (m, a, p) => {
  const cfg = G(m.guild.id).pingOnJoin;
  const sub = (a[0] || "status").toLowerCase();
  if (sub === "on") { if (!cfg.channelId) return err(m, `set a channel first: \`${p}pingonjoin channel #channel\``); cfg.enabled = true; save(); return ok(m, "ping on join **enabled**"); }
  if (sub === "off") { cfg.enabled = false; save(); return ok(m, "ping on join **disabled**"); }
  if (sub === "channel") { const ch = getChannel(m, a[1]); if (!ch) return usage(m, p, "pingonjoin channel <#channel>"); cfg.channelId = ch.id; save(); return ok(m, `new members will be pinged in ${ch}`); }
  if (sub === "message") { const t = a.slice(1).join(" "); if (!t) return usage(m, p, "pingonjoin message <text>"); cfg.message = t; save(); return ok(m, "welcome message updated"); }
  return sendCard(m, { eyebrow: "Ping on join settings", badge: cfg.enabled ? "ENABLED" : "DISABLED",
    footL: p + "pingonjoin", footR: cfg.enabled ? "active" : "paused", fields: [
    ["Channel", cfg.channelId ? chLabel(m, cfg.channelId) : "not set"],
    ["Message", cfg.message],
  ] });
});
// ---- booster
def("booster", "owner", async (m, a, p) => {
  const cfg = G(m.guild.id).booster;
  const sub = (a[0] || "status").toLowerCase();
  if (sub === "enable") { if (!cfg.roleId) return err(m, `set a role first: \`${p}booster role <@role>\``); cfg.enabled = true; save(); return ok(m, "booster perks **enabled**"); }
  if (sub === "disable") { cfg.enabled = false; save(); return ok(m, "booster perks **disabled**"); }
  if (sub === "role") {
    const id = (a[1] || "").replace(/\D/g, "");
    const role = id && m.guild.roles.cache.get(id);
    if (!role) return usage(m, p, "booster role <@role>");
    cfg.roleId = role.id; save(); return ok(m, `booster role set to ${role}`);
  }
  if (sub !== "status") return usage(m, p, "booster [status|enable|disable|role <@role>]");
  return sendCard(m, { eyebrow: "Booster perks", badge: cfg.enabled ? "ENABLED" : "DISABLED",
    footL: p + "booster", footR: cfg.enabled ? "active" : "paused", fields: [
    ["Role", cfg.roleId ? roleLabel(m, cfg.roleId) : "not set"],
  ] });
});

// ---- bot profile (per server)
async function setBotProfile(m, field, value) {
  try {
    await client.rest.patch(Routes.guildMember(m.guild.id, "@me"), { body: { [field]: value } });
    return true;
  } catch (e) { err(m, `couldn't update (${e.message || "discord refused"})`); return false; }
}
async function attachmentDataUri(m, a) {
  const url = m.attachments.first()?.url || (/^https?:\/\//.test(a[0] || "") ? a[0] : null);
  if (!url) return null;
  const res = await fetch(url).catch(() => null);
  if (!res || !res.ok) return null;
  const type = res.headers.get("content-type") || "image/png";
  if (!/^image\/(png|jpe?g|gif|webp)/.test(type)) return null;
  return `data:${type.split(";")[0]};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
}
for (const [cmd, field, label] of [["setbotpfp", "avatar", "avatar"], ["setbotbanner", "banner", "banner"]]) {
  def(cmd, P.ManageGuild, async (m, a, p) => {
    if ((a[0] || "").toLowerCase() === "remove") { if (await setBotProfile(m, field, null)) ok(m, `${label} removed for this server`); return; }
    const uri = await attachmentDataUri(m, a);
    if (!uri) return usage(m, p, `${cmd} [image | remove]`);
    if (await setBotProfile(m, field, uri)) ok(m, `${label} updated for this server`);
  });
}
def("setbotbio", P.ManageGuild, async (m, a, p) => {
  const text = a.join(" ");
  if (!text) return usage(m, p, "setbotbio [text | remove]");
  const remove = text.toLowerCase() === "remove";
  if (await setBotProfile(m, "bio", remove ? null : text.slice(0, 190))) ok(m, remove ? "bio removed for this server" : "bio updated for this server");
});

// ---- reload (config from disk)
def("reload", "owner", async (m) => {
  try { const fresh = JSON.parse(fs.readFileSync(DB_PATH, "utf8")); fresh.guilds ||= {}; fresh.afk ||= {}; db = fresh; ok(m, "reloaded config from disk"); }
  catch (e) { err(m, `couldn't reload (${e.message})`); }
});

def("prefix", null, async (m, a, p) => {
  const g = G(m.guild.id);
  if (!a[0]) return ok(m, `this server's prefix is \`${g.prefix}\``);
  if (!m.member.permissions.has(P.ManageGuild) && m.author.id !== OWNER_ID) return err(m, "missing permissions");
  if (a[0].toLowerCase() === "reset") g.prefix = ","; else if (a[0].length > 5) return err(m, "prefix too long (max 5)"); else g.prefix = a[0];
  save(); ok(m, `prefix set to \`${g.prefix}\``);
});
def("stickymessage", P.ManageMessages, async (m, a, p) => {
  const g = G(m.guild.id);
  const ch = getChannel(m, a[0]) || m.channel;
  const rest = (getChannel(m, a[0]) ? a.slice(1) : a).join(" ");
  if (!rest) return usage(m, p, "stickymessage [#channel] <text|off>");
  if (rest.toLowerCase() === "off") { delete g.sticky[ch.id]; save(); return ok(m, `sticky message removed from ${ch}`); }
  const sent = await ch.send(rest).catch(() => null);
  if (!sent) return err(m, "couldn't send in that channel");
  g.sticky[ch.id] = { content: rest, msgId: sent.id }; save();
  ok(m, `sticky message set in ${ch}`);
});
def("synccategory", P.ManageChannels, async (m) => {
  const cat = m.channel.parent;
  if (!cat) return err(m, "this channel isn't in a category");
  let n = 0;
  for (const ch of cat.children.cache.values()) { if (await ch.lockPermissions().catch(() => null)) n++; }
  ok(m, `synced **${n}** channels with **${cat.name}**`);
});

// ---------------------------------------------------------------------
//  Events
// ---------------------------------------------------------------------
client.once(Events.ClientReady, () => console.log(`logged in as ${client.user.tag}`));

client.on("messageCreate", async (m) => {
  if (m.author.bot || !m.guild) return;
  const g = G(m.guild.id);

  // sticky
  const st = g.sticky[m.channel.id];
  if (st) {
    (await m.channel.messages.fetch(st.msgId).catch(() => null))?.delete().catch(() => {});
    const sent = await m.channel.send(st.content).catch(() => null);
    if (sent) { st.msgId = sent.id; save(); }
  }

  // afk
  const key = `${m.guild.id}-${m.author.id}`;
  if (db.afk[key]) { delete db.afk[key]; save(); m.reply({ embeds: [embed(`👋 ${m.author} welcome back, your afk was removed`)], allowedMentions: { repliedUser: false } }).catch(() => {}); }
  for (const u of m.mentions.users.values()) {
    const afk = db.afk[`${m.guild.id}-${u.id}`];
    if (afk) m.reply({ embeds: [embed(`🌸 **${u.username}** is afk: **${afk.reason}** • <t:${Math.floor(afk.at / 1000)}:R>`)], allowedMentions: { repliedUser: false } }).catch(() => {});
  }

  // anti-minor
  const am = g.antiminor;
  if (am.enabled && am.channels.includes(m.channel.id) && m.content) {
    const why = minorCheck(m.content);
    if (why) {
      await m.delete().catch(() => {});
      const log = am.logChannel && m.guild.channels.cache.get(am.logChannel);
      log?.send({
        content: am.modRole ? `<@&${am.modRole}>` : undefined,
        allowedMentions: { roles: am.modRole ? [am.modRole] : [] },
        embeds: [{ color: PINK, title: "🚨 minor detected", author: { name: m.author.username, icon_url: m.author.displayAvatarURL() },
          description: `\`\`\`${m.content.slice(0, 800)}\`\`\``,
          fields: [{ name: "reason", value: why, inline: true }, { name: "user", value: `\`${m.author.id}\``, inline: true }, { name: "channel", value: `${m.channel}`, inline: true }] }],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`am:ban:${m.author.id}`).setLabel("ban").setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`am:ignore:${m.author.id}`).setLabel("ignore").setStyle(ButtonStyle.Secondary),
        )],
      }).catch(() => {});
      return;
    }
  }

  // commands
  if (m.content.startsWith(g.prefix)) {
    const args = m.content.slice(g.prefix.length).trim().split(/ +/);
    const name = args.shift()?.toLowerCase();
    const c = cmds.get(name);
    if (!c) return;
    if (c.perm === "owner") { if (m.author.id !== OWNER_ID) return; }
    else if (c.perm && !m.member.permissions.has(c.perm) && m.author.id !== OWNER_ID) return err(m, "missing permissions");
    try { await c.fn(m, args, g.prefix); } catch (e) { console.error(`[${name}]`, e); err(m, `error: \`${e.message}\``); }
    return;
  }

  // xp
  if (g.leveling) {
    const u = xpOf(g, m.author.id);
    if (Date.now() - u.last < 60000) return;
    u.last = Date.now();
    const before = levelOf(u.total).level;
    u.total += 15 + Math.floor(Math.random() * 11);
    const after = levelOf(u.total).level;
    save();
    if (after > before) {
      const text = g.levelMessage.replaceAll("{user}", `${m.author}`).replaceAll("{level}", `${after}`);
      const ch = (g.levelChannel && m.guild.channels.cache.get(g.levelChannel)) || m.channel;
      ch.send({ embeds: [embed(`🌸 ${text}`)] }).catch(() => {});
      applyRewards(m.member, g, after);
    }
  }
});

client.on("guildMemberUpdate", async (o, n) => {
  const cfg = G(n.guild.id).booster;
  if (!cfg.enabled || !cfg.roleId) return;
  if (!o.premiumSince && n.premiumSince) n.roles.add(cfg.roleId).catch(() => {});
  if (o.premiumSince && !n.premiumSince) n.roles.remove(cfg.roleId).catch(() => {});
});
client.on("guildMemberAdd", async (mem) => {
  const cfg = G(mem.guild.id).pingOnJoin;
  if (!cfg.enabled || !cfg.channelId) return;
  const ch = mem.guild.channels.cache.get(cfg.channelId);
  ch?.send(cfg.message.replaceAll("{user}", `<@${mem.id}>`).replaceAll("{server}", mem.guild.name)).catch(() => {});
});

client.on("messageDelete", (m) => {
  if (!m.guild || m.author?.bot || !m.content) return;
  pushSnipe(snipes.del, m.channel.id, { content: m.content, author: m.author?.username ?? "unknown", avatar: m.author?.displayAvatarURL(), at: Date.now() });
});
client.on("messageUpdate", (o, n) => {
  if (!o.guild || o.author?.bot || !o.content || o.content === n.content) return;
  pushSnipe(snipes.edit, o.channel.id, { before: o.content, author: o.author?.username ?? "unknown", avatar: o.author?.displayAvatarURL(), at: Date.now() });
});
client.on("messageReactionRemove", (r, u) => {
  if (u.bot || !r.message.guild) return;
  pushSnipe(snipes.react, r.message.channel.id, { emoji: r.emoji.toString(), user: u.username, at: Date.now() });
});

client.on("interactionCreate", async (i) => {
  try {
    // help card navigation
    if ((i.isButton() || i.isStringSelectMenu()) && i.customId.startsWith("help:")) {
      const [, act, ownerId, pageStr] = i.customId.split(":");
      if (act === "noop") return i.deferUpdate();
      if (i.user.id !== ownerId) return i.reply({ content: "✖ this menu belongs to someone else.", flags: 64 });
      const page = act === "menu" ? Number(i.values[0]) : Number(pageStr);
      const prefix = i.guild ? G(i.guild.id).prefix : ",";
      return i.update({ ...helpMessage(page, ownerId, prefix), attachments: [] });
    }
    // anti-minor buttons
    if (i.isButton() && i.customId.startsWith("am:")) {
      const [, act, uid] = i.customId.split(":");
      if (!i.memberPermissions.has(P.BanMembers)) return i.reply({ content: "✖ missing permissions.", flags: 64 });
      const base = i.message.embeds[0]?.data ?? {};
      if (act === "ban") {
        const done = await i.guild.members.ban(uid, { reason: `[anti-minor] banned by ${i.user.username}`, deleteMessageSeconds: 604800 }).catch(() => null);
        const g = G(i.guild.id);
        if (done) { g.cases.push({ id: ++g.caseSeq, type: "ban", userId: uid, modId: i.user.id, reason: "[anti-minor] underage", at: Date.now() }); save(); }
        return i.update({ embeds: [{ ...base, footer: { text: done ? `banned by ${i.user.username}` : "ban failed (already banned or left?)" } }], components: [] });
      }
      return i.update({ embeds: [{ ...base, color: 0x808080, footer: { text: `ignored by ${i.user.username}` } }], components: [] });
    }
  } catch (e) {
    console.error("[interaction]", e);
  }
});

process.on("unhandledRejection", (e) => console.error("[unhandledRejection]", e?.message || e));
process.on("uncaughtException", (e) => console.error("[uncaughtException]", e?.message || e));

client.login(process.env.TOKEN);
