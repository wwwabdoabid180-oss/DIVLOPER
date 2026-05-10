// index.js

require("dotenv").config();

const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeInMemoryStore,
  jidNormalizedUser,
  downloadMediaMessage
} = require("@whiskeysockets/baileys");

const P = require("pino");
const fs = require("fs");
const crypto = require("crypto");
const axios = require("axios");
const { Boom } = require("@hapi/boom");

process.on("uncaughtException", console.error);
process.on("unhandledRejection", console.error);

const OWNER_PHONE = process.env.OWNER_PHONE.replace(/\D/g, "");
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const AUTO_REPLY_FILE = "./database/autoReply.json";
const MEMORY_FILE = "./database/memory.json";
const SETTINGS_FILE = "./database/settings.json";

if (!fs.existsSync("./database")) {
  fs.mkdirSync("./database");
}

function loadJSON(file, fallback = {}) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
  }

  return JSON.parse(fs.readFileSync(file));
}

function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

let autoReply = loadJSON(AUTO_REPLY_FILE, {});
let memory = loadJSON(MEMORY_FILE, {});
let settings = loadJSON(SETTINGS_FILE, {
  autoReply: true
});

const store = { bind: () => {} };

function normalizeNumber(number) {
  return number.replace(/\D/g, "");
}

function isOwner(sender) {
  return sender.includes(OWNER_PHONE);
}

function extractText(message) {
  if (!message) return "";

  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    ""
  );
}

async function askAI(prompt, user) {
  try {
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [
              {
                text: `
أنت بوت واتساب احترافي خاص ب ABID SHOP 😈🔥

تكلم دائماً بالدارجة المغربية الطبيعية.
قصير فالهضرة.
احترافي.
ذكي.
مضحك أحياناً.
ما تبانش روبو.

الخدمات:
- حسابات Free Fire
- شحن الجواهر
- AI
- التصميم
- خدمات رقمية

إذا مفهمتيش الرسالة رجع فقط:
__UNKNOWN__

اسم الزبون:
${user}

الرسالة:
${prompt}
`
              }
            ]
          }
        ]
      },
      {
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

    return res.data.candidates[0].content.parts[0].text.trim();

  } catch (err) {

    console.log(err.response?.data || err.message);

    return "خويا عندنا ضغط دابا 😅 جرب بعد شوية";
  }
}

async function transcribeAudio(buffer) {
  return "";
}

async function startBot() {

  const { state, saveCreds } =
    await useMultiFileAuthState("session");

  const { version } =
    await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: P({
      level: "silent"
    }),
    printQRInTerminal: false,
    auth: {
  creds: state.creds,
  keys: state.keys
},
    browser: ["ABID SHOP", "Chrome", "1.0.0"]
  });

  store.bind(sock.ev);

  if (!sock.authState.creds.registered) {

    const code =
      await sock.requestPairingCode(OWNER_PHONE);

    console.log(`
🔥 Pairing Code:

${code}
`);
  }

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {

    const {
      connection,
      lastDisconnect
    } = update;

    if (connection === "close") {

      const shouldReconnect =
        new Boom(lastDisconnect?.error)?.output?.statusCode !==
        DisconnectReason.loggedOut;

      console.log("🔄 Reconnecting...");

      if (shouldReconnect) {
        startBot();
      }
    }

    if (connection === "open") {
      console.log("🔥 ABID SHOP BOT CONNECTED");
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {

    try {

      const msg = messages[0];

      if (!msg.message) return;

      if (msg.key.fromMe) return;

      const sender =
        jidNormalizedUser(msg.key.remoteJid);

      const senderNumber =
        sender.split("@")[0];

      let text =
        extractText(msg.message).trim();

      if (!text) return;

      console.log(senderNumber, ":", text);

      // OWNER SYSTEM

      if (isOwner(senderNumber)) {

        const lower = text.toLowerCase();

        if (
          lower === "انا المالك" ||
          lower === "owner" ||
          lower === "boss"
        ) {

          return sock.sendMessage(sender, {
            text: "🔥😈 أمرك مالك"
          });
        }

        if (lower.startsWith("نفد")) {

          const command =
            text.slice(4).trim();

          // OFF AUTO REPLY

          if (command.includes("وقف الرد")) {

            settings.autoReply = false;

            saveJSON(SETTINGS_FILE, settings);

            return sock.sendMessage(sender, {
              text: "✅ تم إيقاف الرد التلقائي"
            });
          }

          // ON AUTO REPLY

          if (command.includes("شغل الرد")) {

            settings.autoReply = true;

            saveJSON(SETTINGS_FILE, settings);

            return sock.sendMessage(sender, {
              text: "🔥 تم تشغيل الرد التلقائي"
            });
          }

          // REPLY CLIENT

          const replyMatch =
            command.match(
              /رد على\s+(\+?\d+)\s*:\s*([\s\S]+)/i
            );

          if (replyMatch) {

            const number =
              normalizeNumber(replyMatch[1]);

            const replyText =
              replyMatch[2];

            await sock.sendMessage(
              number + "@s.whatsapp.net",
              {
                text: replyText
              }
            );

            autoReply[number] = replyText;

            saveJSON(
              AUTO_REPLY_FILE,
              autoReply
            );

            return sock.sendMessage(sender, {
              text: "✅ الرسالة تصيفطات"
            });
          }

          return sock.sendMessage(sender, {
            text: "😈 تنفذ الأمر"
          });
        }

        // OWNER CHAT

        const ownerAI =
          await askAI(text, "OWNER");

        return sock.sendMessage(sender, {
          text: ownerAI
        });
      }

      // CLIENT SYSTEM

      if (!settings.autoReply) return;

      const lower = text.toLowerCase();

      // GREETING

      if (
        lower.includes("سلام") ||
        lower.includes("hi") ||
        lower.includes("hello")
      ) {

        return sock.sendMessage(sender, {
          text:
`🔥😈 أهلا! مرحبا بيك ف ABID SHOP

شنو الخدمة اللي بغيتي اليوم؟`
        });
      }

      // SELL ACCOUNT

      if (
        lower.includes("نبيع كونط") ||
        lower.includes("بغيت نبيع كونط")
      ) {

        return sock.sendMessage(sender, {
          text: "صيفط التصاور والثمن اللي باغي 😈"
        });
      }

      // EXCHANGE

      if (
        lower.includes("تبديل")
      ) {

        return sock.sendMessage(sender, {
          text: "حالياً التبديل ماكانديروش 😅"
        });
      }

      // LEARNED REPLY

      if (autoReply[senderNumber]) {

        return sock.sendMessage(sender, {
          text: autoReply[senderNumber]
        });
      }

      // AI REPLY

      const aiReply =
        await askAI(text, senderNumber);

      // UNKNOWN MESSAGE

      if (aiReply === "__UNKNOWN__") {

        await sock.sendMessage(
          OWNER_PHONE + "@s.whatsapp.net",
          {
            text:
`🔔 رسالة جديدة من كليان

📱 الرقم: +${senderNumber}

💬 الرسالة:
${text}`
          }
        );

        return;
      }

      // MEMORY

      if (!memory[senderNumber]) {
        memory[senderNumber] = [];
      }

      memory[senderNumber].push({
        user: text,
        bot: aiReply,
        time: Date.now()
      });

      saveJSON(MEMORY_FILE, memory);

      // SEND MESSAGE

      await sock.sendMessage(sender, {
        text: aiReply
      });

    } catch (err) {

      console.log("ERROR:", err.message);

    }

  });

}

startBot();
