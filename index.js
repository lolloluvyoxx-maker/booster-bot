const { Client, GatewayIntentBits } = require("discord.js");

// ===== CLIENT SETUP =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages
  ],
  partials: ["CHANNEL"]
});

// ===== BOOST CONFIG =====
const SOURCE_GUILD_ID = "1439575441693343809";
const TARGET_GUILD_ID = "1425102156125442140";

const BOOSTER_ROLE_ID = "1439656430163722240";
const ACCESS_ROLE_ID = "1439978535736578119";
const DENIED_ROLE_ID = "1426874194263805992";

// ===== VANITY MONITOR CONFIG =====
const VANITY_CODES = ["vanityteen", "jerkpit", "boytoy"];
const CHECK_INTERVAL = 30 * 1000; // 30 seconds
const NOTIFY_USER_ID = "1005237630113419315";

// Track which vanity was already reported
const vanityStatus = {};
VANITY_CODES.forEach(v => (vanityStatus[v] = false));

// ===== BOT READY =====
client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
  startVanityMonitor();
});

// ===== USER JOINS TARGET SERVER =====
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
  } catch (error) {
    console.error("guildMemberAdd error:", error);
  }
});

// ===== BOOST STATUS CHANGE =====
client.on("guildMemberUpdate", async (oldMember, newMember) => {
  if (oldMember.guild.id !== SOURCE_GUILD_ID) return;

  const hadBoost = !!oldMember.premiumSince;
  const hasBoost = !!newMember.premiumSince;

  try {
    const targetGuild = await client.guilds.fetch(TARGET_GUILD_ID);
    const targetMember = await targetGuild.members.fetch(newMember.id).catch(() => null);
    if (!targetMember) return;

    // Boost removed → DENIED
    if (hadBoost && !hasBoost) {
      await targetMember.roles.remove(ACCESS_ROLE_ID).catch(() => {});
      await targetMember.roles.add(DENIED_ROLE_ID).catch(() => {});
    }

    // Boost added → ACCESS
    if (!hadBoost && hasBoost) {
      await targetMember.roles.add(ACCESS_ROLE_ID).catch(() => {});
      await targetMember.roles.remove(DENIED_ROLE_ID).catch(() => {});
    }
  } catch (error) {
    console.error("guildMemberUpdate error:", error);
  }
});

// ===== VANITY MONITOR (MULTI) =====
function startVanityMonitor() {
  setInterval(async () => {
    for (const vanity of VANITY_CODES) {
      if (vanityStatus[vanity]) continue;

      try {
        const response = await fetch(
          `https://discord.com/api/v10/invites/${vanity}`,
          {
            headers: {
              Authorization: `Bot ${process.env.TOKEN}`
            }
          }
        );

        // 404 = vanity is free
        if (response.status === 404) {
          vanityStatus[vanity] = true;

          const user = await client.users.fetch(NOTIFY_USER_ID);
          await user.send(
            `🚨 **VANITY AVAILABLE** 🚨\n\n` +
            `The vanity URL **discord.gg/${vanity}** is currently AVAILABLE.\n` +
            `Try to claim it manually as soon as possible.`
          );

          console.log(`Vanity available: ${vanity}`);
        }
      } catch (error) {
        console.error(`Vanity monitor error (${vanity}):`, error);
      }
    }
  }, CHECK_INTERVAL);
}

// ===== LOGIN =====
client.login(process.env.TOKEN);
