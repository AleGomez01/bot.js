const axios = require("axios");
const cheerio = require("cheerio");
require("dotenv").config();

// ─── CONFIG ───────────────────────────────────────────────
const BASE_URL = "https://personal.seguridadciudad.gob.ar/Eventuales";
const LOGIN_URL = `${BASE_URL}/Default.aspx`;
const API_URL   = `${BASE_URL}/View/PostuladosCanchaAsync.aspx/GetEventosAPI`;
const WEBHOOK   = process.env.WEBHOOK;
const USUARIO   = process.env.USUARIO;
const CLAVE     = process.env.CLAVE;

// ─── MANEJO MANUAL DE COOKIES ─────────────────────────────
let cookieStore = {};

function parsearSetCookie(headers) {
  const setCookie = headers["set-cookie"];
  if (!setCookie) return;
  for (const c of setCookie) {
    const par = c.split(";")[0];
    const idx = par.indexOf("=");
    if (idx > 0) {
      const key = par.slice(0, idx).trim();
      const val = par.slice(idx + 1).trim();
      cookieStore[key] = val;
    }
  }
}

function getCookieHeader() {
  return Object.entries(cookieStore).map(([k, v]) => `${k}=${v}`).join("; ");
}

// ─── CLIENTE BASE ──────────────────────────────────────────
const client = axios.create({
  timeout: 20000,
  maxRedirects: 5,
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
  },
});

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

  // GET login page
  const getRes = await client.get(LOGIN_URL);
  parsearSetCookie(getRes.headers);

  const $ = cheerio.load(getRes.data);
  const viewstate          = $("#__VIEWSTATE").val();
  const viewstategenerator = $("#__VIEWSTATEGENERATOR").val();
  const eventvalidation    = $("#__EVENTVALIDATION").val();

  if (!viewstate) throw new Error("No se pudo obtener __VIEWSTATE");

  // POST login
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
      "Cookie": getCookieHeader(),
      "Referer": LOGIN_URL,
    },
  });
  parsearSetCookie(postRes.headers);

  if (!postRes.data.includes("Eventuales")) {
    throw new Error("Login falló");
  }

  console.log("✅ Login exitoso");
  console.log("🍪 Cookies tras login:", Object.keys(cookieStore).join(", "));
}

// ─── CHEQUEAR EVENTOS ─────────────────────────────────────
async function chequear() {
  console.log("🔍 Chequeando eventos...");

  // GET previo a la página de eventos
  const getPage = await client.get(`${BASE_URL}/View/PostuladosCanchaAsync.aspx`, {
    headers: { "Cookie": getCookieHeader() }
  });
  parsearSetCookie(getPage.headers);
  console.log("✅ GET previo OK");
  console.log("🍪 Cookies tras GET:", Object.keys(cookieStore).join(", "));

  // POST a la API
  const res = await client.post(API_URL, "", {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Accept": "*/*",
      "Content-Length": "0",
      "X-Requested-With": "XMLHttpRequest",
      "Cookie": getCookieHeader(),
      "Origin": "https://personal.seguridadciudad.gob.ar",
      "Referer": `${BASE_URL}/View/PostuladosCanchaAsync.aspx`,
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
      "sec-ch-ua": '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
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
    const detalle = err.response
      ? `Status: ${err.response.status} - ${JSON.stringify(err.response.data).slice(0, 300)}`
      : err.message;
    console.log("❌ Error detalle:", detalle);
    await enviarDiscord(`⚠️ Bot error: ${detalle}`);
    process.exit(1);
  }
}

main();