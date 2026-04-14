const axios = require("axios");
const cheerio = require("cheerio");
const tough = require("tough-cookie");
const { wrapper } = require("axios-cookiejar-support");
require("dotenv").config();

// ─── CONFIG ───────────────────────────────────────────────
const BASE_URL = "https://personal.seguridadciudad.gob.ar/Eventuales";
const LOGIN_URL = `${BASE_URL}/Default.aspx`;
const API_URL   = `${BASE_URL}/View/PostuladosCanchaAsync.aspx/GetEventosAPI`;
const WEBHOOK   = process.env.WEBHOOK;
const USUARIO   = process.env.USUARIO;
const CLAVE     = process.env.CLAVE;

// ─── CLIENTE CON COOKIES ──────────────────────────────────
const cookieJar = new tough.CookieJar();
const client = wrapper(
  axios.create({
    jar: cookieJar,
    withCredentials: true,
    timeout: 20000,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      "Accept-Language": "es-AR,es;q=0.9",
    },
  })
);

// ─── DISCORD ──────────────────────────────────────────────
async function enviarDiscord(msg) {
  if (!WEBHOOK) return console.log("⚠️  Sin WEBHOOK configurado");
  try {
    await axios.post(WEBHOOK, { content: msg });
    console.log("📨 Mensaje enviado a Discord");
  } catch (err) {
    console.log("❌ Error webhook:", err.message);
  }
}

// ─── LOGIN ────────────────────────────────────────────────
async function login() {
  console.log("🔐 Iniciando sesión...");

  const getRes = await client.get(LOGIN_URL);
  const $ = cheerio.load(getRes.data);

  const viewstate          = $("#__VIEWSTATE").val();
  const viewstategenerator = $("#__VIEWSTATEGENERATOR").val();
  const eventvalidation    = $("#__EVENTVALIDATION").val();

  if (!viewstate) {
    throw new Error("No se pudo obtener __VIEWSTATE — IP posiblemente bloqueada");
  }

  const params = new URLSearchParams();
  params.append("__LASTFOCUS", "");
  params.append("__EVENTTARGET", "btnIngresar");
  params.append("__EVENTARGUMENT", "");
  params.append("__VIEWSTATE", viewstate);
  params.append("__VIEWSTATEGENERATOR", viewstategenerator);
  params.append("__EVENTVALIDATION", eventvalidation);
  params.append("hfRecaptchaToken", "");
  params.append("txtUsuario", USUARIO);
  params.append("txtClave", CLAVE);

  const postRes = await client.post(LOGIN_URL, params.toString(), {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: LOGIN_URL,
    },
    maxRedirects: 5,
  });

  if (!postRes.data.includes("Eventuales")) {
    throw new Error("Login falló — credenciales incorrectas o bloqueado");
  }

  console.log("✅ Login exitoso");
}

// ─── CHEQUEAR EVENTOS ─────────────────────────────────────
async function chequear() {
  console.log("🔍 Chequeando eventos...");

  const res = await client.post(API_URL, "{}", {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Requested-With": "XMLHttpRequest",
      Referer: `${BASE_URL}/View/PostuladosCanchaAsync.aspx`,
    },
  });

  const raw = res.data?.d;
  if (!raw) throw new Error("Respuesta vacía de la API");

  const eventos = JSON.parse(raw);
  console.log(`📋 ${eventos.length} evento(s) encontrados`);

  let encontrados = 0;

  for (const evento of eventos) {
    for (const funcion of evento.Funcion) {
      const cuposLibres = funcion.cupos - funcion.ocupados;

      if (cuposLibres > 0) {
        encontrados++;
        const fecha = new Date(evento.fecha).toLocaleDateString("es-AR");
        const presentacion = new Date(funcion.presentacion).toLocaleString("es-AR");

        const msg =
          `🚨 **CUPOS DISPONIBLES** 🚨\n` +
          `📌 **${evento.evento}**\n` +
          `📅 Fecha: ${fecha}\n` +
          `🎯 Función: ${funcion.funcion}\n` +
          `📦 Módulo: ${funcion.modulo}\n` +
          `📍 Lugar: ${funcion.lugar}\n` +
          `🕐 Presentación: ${presentacion}\n` +
          `✅ Cupos libres: **${cuposLibres}** de ${funcion.cupos}\n` +
          (funcion.observacion ? `📝 Obs: ${funcion.observacion}\n` : "") +
          `🔗 https://personal.seguridadciudad.gob.ar/Eventuales/View/PostuladosCanchaAsync.aspx`;

        console.log(`🆕 Cupos en: ${evento.evento} - ${funcion.funcion} (${cuposLibres} libres)`);
        await enviarDiscord(msg);
      }
    }
  }

  if (encontrados === 0) {
    console.log("😴 Sin cupos disponibles por ahora");
  }
}

// ─── MAIN ─────────────────────────────────────────────────
async function main() {
  try {
    await login();
    await chequear();
    console.log("✔️  Ejecución completada");
  } catch (err) {
    console.log("❌ Error:", err.message);
    await enviarDiscord(`⚠️ Bot error: ${err.message}`);
    process.exit(1);
  }
}

main();