const puppeteer = require("puppeteer");
const dotenv = require("dotenv");

dotenv.config();

const URL = "ACA_TU_URL"; // 👈 poné la URL real

const USUARIO = process.env.USUARIO;
const CLAVE = process.env.CLAVE;

// helper sleep
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(page) {
  console.log("🔐 Logueando...");

  await page.goto(URL, { waitUntil: "networkidle2" });

  await page.waitForSelector('input[type="text"]');
  await page.type('input[type="text"]', USUARIO);

  await page.waitForSelector('input[type="password"]');
  await page.type('input[type="password"]', CLAVE);

  await page.keyboard.press("Enter");

  await sleep(3000);

  console.log("✅ Login OK");
}

async function cerrarModal(page) {
  try {
    const botonCerrar = await page.$('button');

    if (botonCerrar) {
      await botonCerrar.click();
      console.log("❌ Modal cerrado");
    } else {
      console.log("📭 No hay modal");
    }
  } catch (err) {
    console.log("⚠️ Error cerrando modal:", err.message);
  }
}

async function refrescarEventos(page) {
  try {
    console.log("🔄 Refresh eventos");

    const refreshBtn = await page.$('button');

    if (refreshBtn) {
      await refreshBtn.click();
    }

    await sleep(5000);

  } catch (err) {
    console.log("⚠️ Error refrescando:", err.message);
  }
}

async function loop(page) {
  while (true) {
    try {
      await cerrarModal(page);
      await refrescarEventos(page);

      console.log("👀 Revisando eventos...");

      await sleep(5000);

    } catch (err) {
      console.log("⚠️ Error en loop:", err.message);
    }
  }
}

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
  });

  const page = await browser.newPage();

  await login(page);
  await loop(page);
})();