require('dotenv').config();
const puppeteer = require('puppeteer');

let eventosAnteriores = new Set();
const URL = process.env.URL;
const USUARIO = process.env.USUARIO;
const CLAVE = process.env.CLAVE;
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const WEBHOOK = process.env.DISCORD_WEBHOOK;

async function testDiscord() {
  try {
    await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: "🚀 Bot funcionando - prueba OK"
      })
    });

    console.log("📨 Mensaje enviado a Discord");

  } catch (err) {
    console.log("❌ Error webhook:", err.message);
  }
}

async function enviarDiscord(evento, intento = 1) {
  try {
    await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: "🚨 EVENTO DISPONIBLE 🚨",
        embeds: [
          {
            title: "Nuevo evento detectado",
            description: evento.texto,
            color: 16711680,
            timestamp: new Date().toISOString()
          }
        ]
      })
    });

    console.log("📨 Notificación enviada a Discord");

  } catch (err) {
    console.log(`❌ Error Discord (intento ${intento}):`, err.message);

    if (intento < 3) {
      await new Promise(r => setTimeout(r, 2000));
      return enviarDiscord(evento, intento + 1);
    }
  }
}
const sleep = (ms) => new Promise(res => setTimeout(res, ms));

async function cerrarModal(page) {
  try {
    const modal = await page.$('#modalTolerancia');

    if (modal) {
      console.log("🚫 Modal detectado (tolerancia)");

      const checkbox = await page.$('#chkConfirmaLectura');

      if (checkbox) {
        await checkbox.click();
        console.log("☑️ Checkbox marcado");
      }

      await page.waitForFunction(() => {
        const btn = document.querySelector('#btnCerrarModal');
        return btn && window.getComputedStyle(btn).display !== 'none';
      });

      const botonCerrar = await page.$('#btnCerrarModal');

      if (botonCerrar) {
        await page.evaluate(el => el.click(), botonCerrar);
        console.log("❌ Modal cerrado correctamente");
      }
    } 

  } catch (err) {
    console.log("⚠️ Error cerrando modal:", err.message);
    await testDiscord();
  }
}


async function detectarEventos(page) {
  const eventos = await page.evaluate(() => {
  const resultados = [];

  // 🔵 EVENTOS NUEVOS
  const filasEventos = document.querySelectorAll('#tablaEventosBody tr');

  filasEventos.forEach(tr => {
    const texto = tr.innerText.trim();

    if (!texto.includes("No existen eventos")) {
      resultados.push({
        tipo: "evento",
        texto
      });
    }
  });

  // 🟡 REEMPLAZOS
  const filasReemplazos = document.querySelectorAll('#tablaReemplazos tr');

  filasReemplazos.forEach(tr => {
    const texto = tr.innerText.trim();

    if (!texto.includes("No existen reemplazos")) {
      resultados.push({
        tipo: "reemplazo",
        texto
      });
    }
  });

  return resultados;
});

  if (eventos.length === 0) {
    console.log("😴 Todo lleno...");
    return;
  }

  console.log("📊 Eventos detectados:", eventos.length);

  const eventosActuales = new Set();

  for (const e of eventos) {
    console.log("🧪 Revisando:", e.texto);

    const clave = e.texto
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

    eventosActuales.add(clave);

    if (!eventosAnteriores.has(clave)) {
      console.log("🚨 EVENTO NUEVO DETECTADO:");
      console.log(`👉 ${e.texto}`);

      process.stdout.write('\x07');
    

      await enviarDiscord(e);
    }
  }

  // 🔁 actualizar memoria
  eventosAnteriores = eventosActuales;
}

async function refrescarEventos(page) {
  try {
    console.log("🔄 Refrescando eventos...");

    // Esperar que el botón de eventos esté visible
    await page.waitForFunction(() => {
      const btn = document.querySelector('#btnRefrescarGrillaEventos');
      return btn && window.getComputedStyle(btn).display !== 'none';
    });

    await page.click('#btnRefrescarGrillaEventos');
    console.log("✅ Click en eventos");

    // Espera 1 segundo
    await new Promise(r => setTimeout(r, 1000));

    // Esperar botón de reemplazos
    await page.waitForFunction(() => {
      const btn = document.querySelector('#btnRefrescarGrillaReemplazos');
      return btn && window.getComputedStyle(btn).display !== 'none';
    });

    await page.click('#btnRefrescarGrillaReemplazos');
    console.log("🔁 Click en reemplazos");

  } catch (err) {
    console.log("⚠️ Error refrescando:", err.message);
  }
}

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null
  });

  const page = await browser.newPage();

  console.log("🔐 Logueando...");
  await page.goto(URL, { waitUntil: 'networkidle2' });

  // ✅ LOGIN CORRECTO
  await page.waitForSelector('#txtUsuario', { timeout: 10000 });
  await page.waitForSelector('#txtClave', { timeout: 10000 });

  await page.type('#txtUsuario', USUARIO, { delay: 50 });
  await page.type('#txtClave', CLAVE, { delay: 50 });

  // Click login (ASP.NET postback)
  await page.click('#btnIngresar');
  await sleep(5000);

  console.log("✅ Login OK");

  // 🔁 LOOP INFINITO
  while (true) {
  await cerrarModal(page);
  await refrescarEventos(page);
  await detectarEventos(page);

  await sleep(7000);
}
})();