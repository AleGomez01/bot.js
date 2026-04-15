require("dotenv").config({
  path: __dirname + "/.env"
});
const puppeteer = require("puppeteer");


const URL = "https://personal.seguridadciudad.gob.ar/Eventuales/View/PostuladosCanchaAsync.aspx";

const USUARIO = process.env.USUARIO;
const CLAVE = process.env.CLAVE;

let eventosPrevios = new Set();

// ─── LOGIN ─────────────────────────────
console.log("USER:", USUARIO);
console.log("PASS:", CLAVE);

async function login(page) {
  console.log("🔐 Logueando...");

  await page.goto("https://personal.seguridadciudad.gob.ar/Eventuales/Default.aspx", {
    waitUntil: "networkidle2"
  });

  await page.type("#txtUsuario", USUARIO);
  await page.type("#txtClave", CLAVE);

  await Promise.all([
    page.click("#btnIngresar"),
    page.waitForNavigation({ waitUntil: "networkidle2" })
  ]);

  console.log("✅ Login OK");
}

// ─── MODAL ─────────────────────────────
async function handleModal(page) {
  try {
    await page.waitForSelector("#chkConfirmalectura", { timeout: 5000 });

    await page.click("#chkConfirmalectura");

    await page.waitForSelector("#btnCerrarModal", { visible: true });

    await page.click("#btnCerrarModal");

    console.log("✅ Modal cerrado");
  } catch {
    console.log("🟢 No hay modal");
  }
}

// ─── REFRESH ───────────────────────────
async function refreshEventos(page) {
  await page.click("#btnRefrescarGrillaEventos");
  console.log("🔄 Refresh eventos");

  await page.waitForTimeout(5000);
}

// ─── LEER EVENTOS ─────────────────────
async function obtenerEventos(page) {
  return await page.evaluate(() => {
    return Array.from(document.querySelectorAll("#tablaEventosBody tr"))
      .map(tr => {
        const btn = tr.querySelector("button");

        if (!btn) return null;

        return {
          id: btn.dataset.eventoId || btn.innerText,
          texto: btn.innerText.trim(),
          disponible: !btn.disabled
        };
      })
      .filter(Boolean);
  });
}

// ─── LOOP PRINCIPAL ───────────────────
async function loop(page) {
  while (true) {
    try {
      await refreshEventos(page);

      const eventos = await obtenerEventos(page);

      const actuales = new Set(eventos.map(e => e.id));

      const nuevos = eventos.filter(e => !eventosPrevios.has(e.id));

      for (const e of nuevos) {
        if (e.disponible) {
          console.log("🚨 NUEVO DISPONIBLE:", e.texto);
        } else {
          console.log("🆕 Nuevo (sin cupo):", e.texto);
        }
      }

      eventosPrevios = actuales;

    } catch (err) {
      console.log("⚠️ Error en loop:", err.message);

      // posible logout → reintentar login
      await login(page);
      await handleModal(page);
    }

    await new Promise(r => setTimeout(r, 10000)); // 10s
  }
}

// ─── MAIN ─────────────────────────────
(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null
  });

  const page = await browser.newPage();

  await login(page);
  await handleModal(page);

  await page.goto(URL, { waitUntil: "networkidle2" });

  await loop(page);
})();