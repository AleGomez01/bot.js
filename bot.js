const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const tough = require("tough-cookie");
const { wrapper } = require("axios-cookiejar-support");

require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Bot activo");
});

app.listen(PORT, () => {
  console.log("Servidor OK en puerto", PORT);
});

const URL =
  "https://personal.seguridadciudad.gob.ar/Eventuales/View/PostuladosCanchaAsync.aspx";

const WEBHOOK = process.env.WEBHOOK;

let eventosVistos = new Set();

// 🧠 cliente con cookies persistentes
const cookieJar = new tough.CookieJar();
const client = wrapper(
  axios.create({
    jar: cookieJar,
    withCredentials: true,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
    }
  })
);

async function enviarDiscord(msg) {
  try {
    await axios.post(WEBHOOK, { content: msg });
  } catch (err) {
    console.log("Error webhook:", err.message);
  }
}

// 🔥 warmup inicial (IMPORTANTE en Render)
async function iniciarSesion() {
  try {
    console.log("🟡 iniciando sesión base...");

    await client.get(URL);

    console.log("🟢 sesión inicial lista");
  } catch (err) {
    console.log("Error sesión:", err.message);
  }
}

async function chequear() {
  try {
    console.log("Chequeando...");

    const res = await client.get(URL);
    const $ = cheerio.load(res.data);

    const eventos = [];

    $(".btnPostular").each((i, el) => {
      const texto = $(el).text().trim();

      const id = $(el)
        .closest("tr")
        .text()
        .replace(/\s+/g, " ")
        .trim();

      eventos.push({ texto, id });
    });

    if (eventos.length === 0) {
      console.log("🟡 no hay eventos visibles (posible login requerido)");
      return;
    }

    for (const ev of eventos) {
      if (!eventosVistos.has(ev.id)) {
        console.log("Nuevo evento:", ev.texto);

        await enviarDiscord(`🚨 NUEVO evento:\n${ev.texto}`);

        eventosVistos.add(ev.id);
      }
    }
  } catch (err) {
    console.log("Error chequeo:", err.message);
  }
}

async function iniciar() {
  console.log("🟡 bot iniciando SIN Puppeteer (modo estable)");

  await iniciarSesion();

  await enviarDiscord("✅ Bot activo (Render + Axios stable)");

  setTimeout(async () => {
  await chequear();
   }, 5000);

setInterval(chequear, 30000);

  setInterval(() => {
    console.log("🟢 bot vivo...");
  }, 15000);
}

iniciar();

process.on("uncaughtException", (err) => {
  console.log("❌ ERROR:", err);
});

process.on("unhandledRejection", (err) => {
  console.log("❌ PROMISE ERROR:", err);
});

console.log("🟢 iniciando loop de chequeo...");

setInterval(() => {
  console.log("🟢 tick chequeo activo");
}, 10000);