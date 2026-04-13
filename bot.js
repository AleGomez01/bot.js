const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("Bot activo");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Servidor vivo en puerto", PORT);
});

require('dotenv').config();

const axios = require("axios");
const cheerio = require("cheerio");

const URL = 'https://personal.seguridadciudad.gob.ar/Eventuales/View/PostuladosCanchaAsync.aspx';
const WEBHOOK = process.env.WEBHOOK;
const USER = process.env.USER;
const PASS = process.env.PASS;

let eventosVistos = new Set();

let loggedIn = false;

async function enviarDiscord(msg) {
  try {
    await axios.post(WEBHOOK, { content: msg });
  } catch (err) {
    console.log("Error webhook:", err.message);
  }
}

async function login() {
  try {
    console.log("🟡 obteniendo página de login...");

    const res = await axios.get(URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
      }
    });

    const $ = cheerio.load(res.data);

    // ⚠️ IMPORTANTE:
    // Esta web usa sesión ASP.NET -> si requiere login POST real, lo ajustamos después
    // Pero primero probamos si ya expone datos o redirige

    if ($("title").text().includes("Login") || res.data.includes("txtUsuario")) {
      console.log("🟡 requiere login real (AJAX/POST)");

      await enviarDiscord("⚠️ Bot iniciado pero login manual requerido (ajuste siguiente fase)");
      return false;
    }

    console.log("🟢 página accesible sin login directo");
    loggedIn = true;
    return true;

  } catch (err) {
    console.log("Error login:", err.message);
    return false;
  }
}

async function chequear() {
  try {
    console.log("Chequeando...");

    const res = await axios.get(URL);
    const $ = cheerio.load(res.data);

    const eventos = [];

    $(".btnPostular").each((i, el) => {
      const texto = $(el).text().trim();

      const id =
        $(el).closest("tr").text().replace(/\s+/g, " ").trim();

      eventos.push({ texto, id });
    });

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
  console.log("🟡 bot iniciando sin puppeteer...");

  const ok = await login();

  if (!ok) {
    console.log("⚠️ No se pudo autenticar aún, pero bot activo");
  }

  await enviarDiscord("✅ Bot activo (modo estable sin Puppeteer)");

  setInterval(chequear, 30000);

  setInterval(() => {
    console.log("🟢 bot vivo...");
  }, 15000);
}

iniciar();

process.on("uncaughtException", err => {
  console.log("❌ ERROR:", err);
});

process.on("unhandledRejection", err => {
  console.log("❌ PROMISE ERROR:", err);
});