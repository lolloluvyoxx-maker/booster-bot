const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: ["CHANNEL"]
});

// ===== OWNER =====
const OWNER_ID = "1005237630113419315";

// ===== BOOST CONFIG =====
const SOURCE_GUILD_ID = "1439575441693343809";
const TARGET_GUILD_ID = "1425102156125442140";

const BOOSTER_ROLE_ID = "1439656430163722240";
const ACCESS_ROLE_ID = "1439978535736578119";
const DENIED_ROLE_ID = "1426874194263805992";

// ===== VANITY CONFIG =====
const VANITY_CODES = ["vanityteen", "jerkpit", "boytoy"];
const CHECK_INTERVAL = 30 * 1000;
const REQUIRED_404_COUNT = 5;

// ===== TRACKERS =====
const vanity404Counter = {};
const vanityNotified = {};

VANITY_CODES.forEach(v => {
  vanity404Counter[v] = 0;
  vanityNotified[v] = false;
});

// ===== UTIL =====
function utcTimestamp() {
  return new Date().toISOString().replace("T", " ").replace("Z", " UTC");
}

// ===== READY =====
client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
  startVanityMonitor();
});

// ===== TARGET JOIN =====
client.on("guildMemberAdd", async (member) => {
  if (member.guild.id !== TARGET_GUILD_ID) return;

  try {
    const sourceGuild = await client.guilds.fetch(SOURCE_GUILD_ID);
    const sourceMember = await sourceGuild.members.fetch(member.id).catch(() => null);

    if (sourceMember && sourceMember.roles.cache.has(BOOSTER_ROLE_ID)) {
      await member.roles.add(ACCESS_ROLE_ID);
      await member.roles.remove(DENIED_ROLE_ID).catch(() => {});
    } else {
      await member.roles.add(DENIED_ROLE_ID);
    }
  } catch (e) {
    console.error(e);
  }
});

// ===== BOOST CHANGE =====
client.on("guildMemberUpdate", async (oldM, newM) => {
  if (oldM.guild.id !== SOURCE_GUILD_ID) return;

  const hadBoost = !!oldM.premiumSince;
  const hasBoost = !!newM.premiumSince;

  try {
    const target = await client.guilds.fetch(TARGET_GUILD_ID);
    const member = await target.members.fetch(newM.id).catch(() => null);
    if (!member) return;

    if (hadBoost && !hasBoost) {
      await member.roles.remove(ACCESS_ROLE_ID).catch(() => {});
      await member.roles.add(DENIED_ROLE_ID).catch(() => {});
    }

    if (!hadBoost && hasBoost) {
      await member.roles.add(ACCESS_ROLE_ID).catch(() => {});
      await member.roles.remove(DENIED_ROLE_ID).catch(() => {});
    }
  } catch (e) {
    console.error(e);
  }
});

// ===== RESET COMMAND =====
client.on("messageCreate", async (msg) => {
  if (msg.author.id !== OWNER_ID) return;
  if (!msg.content.startsWith("!resetvanity")) return;

  const arg = msg.content.split(" ")[1];
  if (!arg) {
    msg.reply("Usage: `!resetvanity <name | all>`");
    return;
  }

  if (arg === "all") {
    VANITY_CODES.forEach(v => {
      vanity404Counter[v] = 0;
      vanityNotified[v] = false;
    });
    msg.reply("✅ All vanity monitors have been reset.");
    return;
  }

  if (!VANITY_CODES.includes(arg)) {
    msg.reply("❌ Vanity not found.");
    return;
  }

  vanity404Counter[arg] = 0;
  vanityNotified[arg] = false;
  msg.reply(`✅ Vanity **${arg}** has been reset.`);
});

// ===== VANITY MONITOR =====
function startVanityMonitor() {
  setInterval(async () => {
    for (const vanity of VANITY_CODES) {
      if (vanityNotified[vanity]) continue;

      try {
        const res = await fetch(
          `https://discord.com/api/v10/invites/${vanity}`,
          { headers: { Authorization: `Bot ${process.env.TOKEN}` } }
        );

        if (res.status === 404) {
          vanity404Counter[vanity]++;
        } else {
          vanity404Counter[vanity] = 0;
        }

        if (vanity404Counter[vanity] >= REQUIRED_404_COUNT) {
          vanityNotified[vanity] = true;

          const user = await client.users.fetch(OWNER_ID);
          await user.send(
            `🚨 **VANITY AVAILABLE** 🚨\n\n` +
            `Vanity: **discord.gg/${vanity}**\n` +
            `Time: **${utcTimestamp()}**`
          );

          console.log(`Vanity confirmed free: ${vanity}`);
        }
      } catch (e) {
        console.error(e);
      }
    }
  }, CHECK_INTERVAL);
}

client.login(process.env.TOKEN);
