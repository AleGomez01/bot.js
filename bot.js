const puppeteer = require('puppeteer');

const WEBHOOK = 'https://discord.com/api/webhooks/1493055792159654139/niJrzak_5epZZlrSf6qHP7z0SqsWVmS1rVYA24gZ7Oub5EA1BMb2SHC1KsH6PYqW-Odv';
const URL = 'https://personal.seguridadciudad.gob.ar/Eventuales/View/PostuladosCanchaAsync.aspx';

const USER = '36379';
const PASS = 'Mortadela13';

let ejecutando = false;

async function enviarDiscord(msg){
  try {
    const res = await fetch(WEBHOOK, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ content: msg })
    });

    if (!res.ok) {
      console.log("Error enviando a Discord:", res.status);
    }

  } catch (err) {
    console.log("Error webhook:", err);
  }
}

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(URL, { waitUntil: 'networkidle2' });

  // LOGIN
  await page.type('#txtUsuario', USER);
  await page.type('#txtClave', PASS);

  await Promise.all([
    page.click('#btnIngresar'),
    page.waitForNavigation({ waitUntil: 'networkidle2' })
  ]);

  console.log('Logueado correctamente');

  enviarDiscord("✅ Bot activo y funcionando");

  await page.reload({ waitUntil: 'networkidle2' });

  await page.waitForSelector('.btnPostular', { timeout: 10000 });

  let eventosVistos = new Set();

async function chequear() {
  if (ejecutando) return; // 👈 evita doble ejecución

  ejecutando = true;

  try {
    console.log("Chequeando...");

    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForSelector('.btnPostular', { timeout: 10000 });

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

    eventos.forEach(ev => {
      const clave = ev.id;

      if (!eventosVistos.has(clave)) {
        console.log("Nuevo evento:", ev.texto);
        enviarDiscord(`🚨 NUEVO evento:\n${ev.texto}`);
        eventosVistos.add(clave);
      }
    });

  } catch (e) {
    console.log('Error:', e);
  } finally {
    ejecutando = false; // 👈 libera el lock SIEMPRE
  }
}
  chequear(); // corre una vez al inicio
setInterval(chequear, 30000);
})();