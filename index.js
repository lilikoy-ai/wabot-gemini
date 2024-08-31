const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const pino = require("pino");
const { Boom } = require("@hapi/boom");
const fs = require("fs");
require("dotenv").config();

const sessionName = "yusril";

// Inisialisasi instance Generative AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Fungsi untuk menghasilkan respon dari model AI
async function generateResponse(prompt) {
  const model = genAI.getGenerativeModel({ model: "gemini-pro" });
  const result = await model.generateContent(prompt);
  return result.response.text();
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(`./${sessionName ? sessionName : "session"}`);
  const { version, isLatest } = await fetchLatestBaileysVersion();

  console.log(`Menggunakan versi WA: ${version.join(".")}, versi terbaru: ${isLatest}`);

  const sock = makeWASocket({
    logger: pino({ level: "silent" }),
    printQRInTerminal: true,
    auth: state,
  });

  sock.ev.on("messages.upsert", async (chatUpdate) => {
    try {
      const message = chatUpdate.messages[0];
      if (!message.message) return;

      const messageContent = message.message.conversation || message.message.extendedTextMessage?.text;
      if (messageContent && messageContent.startsWith(".bot")) {
        const query = messageContent.slice(4).trim() || "Hi";
        const response = await generateResponse(query);
        await sock.sendMessage(message.key.remoteJid, { text: response });
      }
    } catch (err) {
      console.error("Error handling message:", err);
    }
  });

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === "close") {
      const reason = new Boom(lastDisconnect?.error)?.output.statusCode;
      switch (reason) {
        case DisconnectReason.badSession:
          console.log("Sesi buruk, harap hapus sesi dan scan ulang.");
          process.exit();
          break;
        case DisconnectReason.connectionClosed:
          console.log("Koneksi terputus, mencoba menghubungkan kembali...");
          startBot();
          break;
        case DisconnectReason.loggedOut:
          console.log("Terlogout, harap hapus sesi dan scan ulang.");
          process.exit();
          break;
        default:
          console.log(`Terputus dengan alasan tidak dikenal: ${reason}`);
          startBot();
          break;
      }
    } else if (connection === "open") {
      console.log("Terhubung ke WhatsApp Web.");
    }
  });

  sock.ev.on("creds.update", saveCreds);
}

startBot();

fs.watchFile(__filename, () => {
  fs.unwatchFile(__filename);
  console.log(`Update pada file ${__filename}`);
  delete require.cache[require.resolve(__filename)];
  require(__filename);
});
