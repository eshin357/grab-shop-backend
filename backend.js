// backend/backend.js — Lens → Shopping → 1st merchant
const express   = require('express');
const cors      = require('cors');
const puppeteer = require('puppeteer-extra');
const Stealth   = require('puppeteer-extra-plugin-stealth');
const fs        = require('fs');
const os        = require('os');
const path      = require('path');

puppeteer.use(Stealth());

// run headless when NODE_ENV=production
const HEADLESS = process.env.NODE_ENV === 'production';

// pick up the Chrome executable that our Dockerfile (or Render) will install
const CHROME_PATH =
  process.env.PUPPETEER_EXECUTABLE_PATH ||
  process.env.CHROME_PATH ||
  '/usr/bin/google-chrome-stable';

const TILE_SELECTORS = [
  'div.kbOPBd.cvP2Ce',                   // grid layout
  'div.sh-dgr__grid-result',             // older grid
  'div.N54PNb.BToiNc',                   // list
  'div[data-docid] div[jsname][role="link"]' // side-panel
];

async function lensToMerchant(buffer) {
  // build our launch options
  const launchOpts = {
    headless: HEADLESS ? 'new' : false,
    defaultViewport: null,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--lang=en-US'
    ],
    executablePath: CHROME_PATH
  };

  const browser = await puppeteer.launch(launchOpts);

  // write to a temp file
  const tmp = path.join(os.tmpdir(), `snippet-${Date.now()}.png`);
  fs.writeFileSync(tmp, buffer);

  try {
    const [page] = await browser.pages();
    await page.goto('https://images.google.com/', { waitUntil: 'networkidle2' });
    await page.click('div[aria-label="Search by image"]');

    const input = await page.waitForSelector('input[type=file]', { timeout: 5000 });
    await input.uploadFile(tmp);
    await page.waitForNavigation({ waitUntil: 'networkidle2' });

    // switch to “Products” or “Shopping” if present
    const switched = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('a,button')]
        .find(el => /Products|Shopping/i.test(el.innerText));
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (switched) {
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5000 })
        .catch(() => {});
    }

    // find the first matching tile
    let sel = null;
    for (const s of TILE_SELECTORS) {
      try {
        await page.waitForSelector(s, { timeout: 2000 });
        sel = s;
        break;
      } catch {}
    }
    if (!sel) return null;

    // grab its first outbound link
    const url = await page.evaluate(s => {
      const tile = document.querySelector(s);
      if (!tile) return null;
      const a = tile.querySelector('a[href^="http"]');
      return a && !a.href.includes('google') ? a.href : null;
    }, sel);

    return url;
  } finally {
    fs.unlinkSync(tmp);
    if (HEADLESS) await browser.close();
  }
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '8mb' }));

app.get('/detect', (_req, res) =>
  res.send('GrabShop backend is up — POST JSON { image: dataURL }')
);

app.post('/detect', async (req, res) => {
  try {
    const dataUrl = req.body.image || '';
    const b64     = dataUrl.split(',')[1];
    if (!b64) return res.status(400).json({ url: null });
    const buf     = Buffer.from(b64, 'base64');
    const url     = await lensToMerchant(buf);
    res.json({ url: url || null });
  } catch (e) {
    console.error(e);
    res.status(500).json({ url: null });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () =>
  console.log(`✅ Listening on http://0.0.0.0:${PORT}/detect`)
);
