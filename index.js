const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

// 🔴 METTI QUI GLI ID
const ROLE_ID = "1439656430163722240";
const GUILD_ID = "ID_DEL_SERVER";

client.once("ready", () => {
  console.log(`Online come ${client.user.tag}`);
});

client.on("guildMemberUpdate", async (oldMember, newMember) => {
  const before = oldMember.premiumSince;
  const after = newMember.premiumSince;

  // quando boosta
  if (!before && after) {
    await newMember.roles.add(ROLE_ID).catch(console.error);
  }

  // quando toglie il boost
  if (before && !after) {
    await newMember.roles.remove(ROLE_ID).catch(console.error);
  }
});

client.login(process.env.TOKEN);
