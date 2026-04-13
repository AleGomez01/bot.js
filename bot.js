require('dotenv').config();

const fetch = (...args) =>
  import('node-fetch').then(({ default: fetch }) => fetch(...args));

const puppeteer = require('puppeteer');

const URL = 'https://personal.seguridadciudad.gob.ar/Eventuales/View/PostuladosCanchaAsync.aspx';
const WEBHOOK = process.env.WEBHOOK;
const USER = process.env.USER;
const PASS = process.env.PASS;

let ejecutando = false;
let browser;
let page;

process.on('uncaughtException', err => {
  console.log('❌ ERROR FATAL:', err);
});

process.on('unhandledRejection', err => {
  console.log('❌ PROMISE ERROR:', err);
});

async function enviarDiscord(msg) {
  try {
    const res = await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: msg })
    });

    if (!res.ok) {
      console.log("Error enviando a Discord:", res.status);
    }
  } catch (err) {
    console.log("Error webhook:", err);
  }
}

async function navegarSeguro(page, url) {
  for (let i = 0; i < 3; i++) {
    try {
      console.log(`🟡 intento navegación ${i + 1}`);

      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 0
      });

      await page.waitForSelector('body', { timeout: 20000 });

      console.log("🟢 navegación OK");
      return;

    } catch (err) {
      console.log("❌ fallo navegación:", err.message);
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  throw new Error("No se pudo cargar la página después de 3 intentos");
}

async function iniciar() {
  browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu"
    ]
  });

  page = await browser.newPage();

  page.on('requestfailed', req => {
    console.log('❌ FAIL:', req.url());
  });

  await page.setDefaultNavigationTimeout(0);
  await page.setDefaultTimeout(0);

  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
  );

  await page.setJavaScriptEnabled(true);

  console.log("🟡 abriendo página...");

  await navegarSeguro(page, URL);

  console.log("🟢 página cargada");

  await page.waitForTimeout(3000);

  // LOGIN ROBUSTO
  await page.waitForSelector('#txtUsuario', { timeout: 60000 });

  console.log("🟡 login detectado");

  await page.type('#txtUsuario', USER, { delay: 30 });
  await page.type('#txtClave', PASS, { delay: 30 });

  try {
    await Promise.all([
      page.click('#btnIngresar'),
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 0 })
    ]);
  } catch (e) {
    console.log("⚠️ navegación post-login ignorada (normal en cloud)");
  }

  console.log('Logueado correctamente');
  await enviarDiscord("✅ Bot activo y funcionando");

  await page.waitForTimeout(3000);
}

let eventosVistos = new Set();

async function chequear() {
  if (ejecutando) return;
  ejecutando = true;

  try {
    console.log("Chequeando...");

    await page.reload({ waitUntil: 'domcontentloaded' });

    await page.waitForSelector('.btnPostular', { timeout: 30000 });

    const eventos = await page.evaluate(() => {
      const botones = document.querySelectorAll('.btnPostular');
      const disponibles = [];

      botones.forEach(btn => {
        if (!btn.disabled && !btn.classList.contains('disabled')) {
          disponibles.push({
            texto: btn.innerText,
            id: (btn.closest('tr')?.innerText || '').replace(/\s+/g, ' ').trim()
          });
        }
      });

      return disponibles;
    });

    for (const ev of eventos) {
      const clave = ev.id;

      if (!eventosVistos.has(clave)) {
        console.log("Nuevo evento:", ev.texto);
        await enviarDiscord(`🚨 NUEVO evento:\n${ev.texto}`);
        eventosVistos.add(clave);
      }
    }

  } catch (e) {
    console.log('Error en chequeo:', e.message);
  } finally {
    ejecutando = false;
  }
}

(async () => {
  try {
    await iniciar();

    await chequear();
    setInterval(chequear, 30000);

    setInterval(() => {
      console.log("🟢 bot vivo...");
    }, 15000);

  } catch (err) {
    console.log("❌ FALLO INICIAL:", err);
  }
})();