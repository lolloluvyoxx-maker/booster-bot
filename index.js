const { Client, GatewayIntentBits } = require("discord.js");

// ===== CLIENT =====
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

// ===== VANITY CONFIG =====
const VANITY_CODE = "vanityteen";
const CHECK_INTERVAL = 30 * 1000; // 30 secondi
const NOTIFY_USER_ID = "1005237630113419315";

let vanityAlreadyFree = false;

// ===== READY =====
client.once("ready", () => {
  console.log(`Online come ${client.user.tag}`);
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
  } catch (err) {
    console.error("guildMemberAdd error:", err);
  }
});

// ===== BOOST UPDATE =====
client.on("guildMemberUpdate", async (oldMember, newMember) => {
  if (oldMember.guild.id !== SOURCE_GUILD_ID) return;

  const hadBoost = !!oldMember.premiumSince;
  const hasBoost = !!newMember.premiumSince;

  try {
    const targetGuild = await client.guilds.fetch(TARGET_GUILD_ID);
    const targetMember = await targetGuild.members.fetch(newMember.id).catch(() => null);
    if (!targetMember) return;

    // ❌ Boost rimosso
    if (hadBoost && !hasBoost) {
      await targetMember.roles.remove(ACCESS_ROLE_ID).catch(() => {});
      await targetMember.roles.add(DENIED_ROLE_ID).catch(() => {});
    }

    // ✅ Boost aggiunto
    if (!hadBoost && hasBoost) {
      await targetMember.roles.add(ACCESS_ROLE_ID).catch(() => {});
      await targetMember.roles.remove(DENIED_ROLE_ID).catch(() => {});
    }

  } catch (err) {
    console.error("guildMemberUpdate error:", err);
  }
});

// ===== VANITY MONITOR =====
function startVanityMonitor() {
  setInterval(async () => {
    if (vanityAlreadyFree) return;

    try {
      const res = await fetch(
        `https://discord.com/api/v10/invites/${VANITY_CODE}`,
        {
          headers: {
            Authorization: `Bot ${process.env.TOKEN}`
          }
        }
      );

      // 404 = vanity libera
      if (res.status === 404) {
        vanityAlreadyFree = true;

        const user = await client.users.fetch(NOTIFY_USER_ID);
        await user.send(
          `🚨 **VANITY DISPONIBILE** 🚨\n\n` +
          `👉 discord.gg/${VANITY_CODE} risulta LIBERA adesso.\n` +
          `Prova a prenderla manualmente subito.`
        );

        console.log("Vanity libera, DM inviato.");
      }
    } catch (err) {
      console.error("Vanity monitor error:", err);
    }
  }, CHECK_INTERVAL);
}

// ===== LOGIN =====
client.login(process.env.TOKEN);
