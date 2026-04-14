const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const tough = require("tough-cookie");
const { wrapper } = require("axios-cookiejar-support");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => res.send("✅ Bot activo"));
app.listen(PORT, () => console.log("Servidor OK en puerto", PORT));

// ─── CONFIG ───────────────────────────────────────────────
const BASE_URL = "https://personal.seguridadciudad.gob.ar/Eventuales";
const LOGIN_URL = `${BASE_URL}/Default.aspx`;
const API_URL   = `${BASE_URL}/View/PostuladosCanchaAsync.aspx/GetEventosAPI`;
const WEBHOOK   = process.env.WEBHOOK;
const USUARIO   = process.env.USUARIO;
const CLAVE     = process.env.CLAVE;

const INTERVALO_MS      = 2 * 60 * 1000; // chequear cada 2 minutos
const REINTENTAR_LOGIN  = 10 * 60 * 1000; // re-login cada 10 minutos

// ─── CLIENTE CON COOKIES ──────────────────────────────────
let cookieJar = new tough.CookieJar();
let client = crearCliente();

function crearCliente() {
  return wrapper(
    axios.create({
      jar: cookieJar,
      withCredentials: true,
      timeout: 15000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        "Accept-Language": "es-AR,es;q=0.9",
      },
    })
  );
}

// ─── ESTADO ───────────────────────────────────────────────
const eventosVistos = new Set(); // guarda idEventoFuncion ya alertados
let sesionActiva = false;

// ─── DISCORD ──────────────────────────────────────────────
async function enviarDiscord(msg) {
  if (!WEBHOOK) return console.log("⚠️  Sin WEBHOOK configurado");
  try {
    await axios.post(WEBHOOK, { content: msg });
  } catch (err) {
    console.log("Error webhook:", err.message);
  }
}

// ─── LOGIN ────────────────────────────────────────────────
async function login() {
  try {
    console.log("🔐 Iniciando sesión...");

    // 1) GET para obtener ViewState
    const getRes = await client.get(LOGIN_URL);
    const $ = cheerio.load(getRes.data);

    const viewstate          = $("#__VIEWSTATE").val();
    const viewstategenerator = $("#__VIEWSTATEGENERATOR").val();
    const eventvalidation    = $("#__EVENTVALIDATION").val();

    if (!viewstate) {
      console.log("❌ No se pudo obtener __VIEWSTATE — la página bloqueó el GET");
      sesionActiva = false;
      return false;
    }

    // 2) POST login
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

    // Si después del redirect llegamos a la página principal, login OK
    if (postRes.data.includes("PostuladosCanchaAsync") || postRes.data.includes("Eventuales")) {
      console.log("✅ Login exitoso");
      sesionActiva = true;
      return true;
    } else {
      console.log("❌ Login falló — respuesta inesperada");
      sesionActiva = false;
      return false;
    }
  } catch (err) {
    console.log("❌ Error en login:", err.message);
    sesionActiva = false;
    return false;
  }
}

// ─── CHEQUEAR EVENTOS ─────────────────────────────────────
async function chequear() {
  if (!sesionActiva) {
    console.log("⚠️  Sin sesión, saltando chequeo");
    return;
  }

  try {
    console.log("🔍 Chequeando eventos...");

    const res = await client.post(
      API_URL,
      "{}",
      {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "X-Requested-With": "XMLHttpRequest",
          Referer: `${BASE_URL}/View/PostuladosCanchaAsync.aspx`,
        },
      }
    );

    // La respuesta viene como { d: "[...json string...]" }
    const raw = res.data?.d;
    if (!raw) {
      console.log("⚠️  Respuesta vacía — posible sesión expirada");
      sesionActiva = false;
      return;
    }

    const eventos = JSON.parse(raw);

    for (const evento of eventos) {
      for (const funcion of evento.Funcion) {
        const key = `${funcion.idEventoFuncion}`;
        const cuposLibres = funcion.cupos - funcion.ocupados;

        if (cuposLibres > 0 && !eventosVistos.has(key)) {
          eventosVistos.add(key);

          const fecha = new Date(evento.fecha).toLocaleDateString("es-AR");
          const presentacion = new Date(funcion.presentacion).toLocaleString("es-AR");

          const msg =
            `🚨 **NUEVO EVENTO CON CUPOS DISPONIBLES** 🚨\n` +
            `📌 **${evento.evento}**\n` +
            `📅 Fecha: ${fecha}\n` +
            `🎯 Función: ${funcion.funcion}\n` +
            `📦 Módulo: ${funcion.modulo}\n` +
            `📍 Lugar: ${funcion.lugar}\n` +
            `🕐 Presentación: ${presentacion}\n` +
            `✅ Cupos libres: **${cuposLibres}** de ${funcion.cupos}\n` +
            (funcion.observacion ? `📝 Obs: ${funcion.observacion}\n` : "") +
            `🔗 https://personal.seguridadciudad.gob.ar/Eventuales/View/PostuladosCanchaAsync.aspx`;

          console.log("🆕 Evento nuevo con cupos:", evento.evento, "-", funcion.funcion);
          await enviarDiscord(msg);
        }
      }
    }

    console.log(`✔️  Chequeo OK — ${eventos.length} evento(s) encontrados`);
  } catch (err) {
    console.log("❌ Error en chequeo:", err.message);
    if (err.response?.status === 401 || err.response?.status === 302) {
      sesionActiva = false;
    }
  }
}

// ─── RE-LOGIN PERIÓDICO ───────────────────────────────────
async function mantenerSesion() {
  const ok = await login();
  if (!ok) {
    await enviarDiscord("⚠️ Bot: falló el login. Reintentando en 10 minutos...");
  }
}

// ─── INICIO ───────────────────────────────────────────────
async function iniciar() {
  console.log("🤖 Bot iniciando...");

  const ok = await login();
  if (ok) {
    await enviarDiscord("✅ Bot activo y con sesión iniciada");
    await chequear();
  } else {
    await enviarDiscord("⚠️ Bot activo pero falló el login inicial. Reintentando...");
  }

  setInterval(chequear, INTERVALO_MS);
  setInterval(mantenerSesion, REINTENTAR_LOGIN);
}

iniciar();

process.on("uncaughtException", (err) => console.log("❌ ERROR:", err));
process.on("unhandledRejection", (err) => console.log("❌ PROMISE:", err));