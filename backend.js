// backend/backend.js — Lens → Shopping → merchant link finder
const express   = require('express');
const cors      = require('cors');
const puppeteer = require('puppeteer-extra');
const Stealth   = require('puppeteer-extra-plugin-stealth');
const fs        = require('fs');
const os        = require('os');
const path      = require('path');

puppeteer.use(Stealth());

const HEADLESS = process.env.NODE_ENV === 'production';
const CHROME_PATH =
  process.env.PUPPETEER_EXECUTABLE_PATH ||
  process.env.CHROME_PATH ||
  '/usr/bin/google-chrome-stable';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/124.0.0.0 Safari/537.36';

const TILE_SELECTORS = [
  'div.kbOPBd.cvP2Ce',
  'div.sh-dgr__grid-result',
  'div.N54PNb.BToiNc',
  'div[data-docid] div[jsname][role="link"]'
];

async function lensToMerchant(buffer) {
  console.log('🔍 Starting lensToMerchant… buffer size:', buffer.length);

  const browser = await puppeteer.launch({
    headless: HEADLESS ? 'new' : false,
    executablePath: CHROME_PATH,
    defaultViewport: null,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--lang=en-US'
    ]
  });

  // write temp PNG
  const tmp = path.join(os.tmpdir(), `snippet-${Date.now()}.png`);
  fs.writeFileSync(tmp, buffer);

  try {
    const [page] = await browser.pages();
    await page.setUserAgent(UA);
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US' });
    await page.emulateTimezone('America/Los_Angeles');

    console.log('▶️  Navigating to images.google.com');
    await page.goto('https://images.google.com/', { waitUntil: 'networkidle2' });

    console.log('📸  Clicking “Search by image”');
    await page.click('div[aria-label="Search by image"]');
    const input = await page.waitForSelector('input[type=file]', { timeout: 10000 });
    await input.uploadFile(tmp);

    console.log('⏳  Waiting for results page…');
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });

    console.log('🔄  Looking for “Products” tab…');
    const switched = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('a,button'))
        .find(el => /Products|Shopping/i.test(el.innerText));
      if (btn) { btn.click(); return true; }
      return false;
    });
    console.log('   switched tab?', switched);
    if (switched) {
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5000 }).catch(() => {});
    }

    console.log('🔎  Scanning for any of', TILE_SELECTORS);
    let sel = null;
    for (const s of TILE_SELECTORS) {
      try {
        await page.waitForSelector(s, { timeout: 3000 });
        sel = s;
        console.log('   ✓ found selector:', s);
        break;
      } catch {}
    }
    if (!sel) {
      console.log('   ✖ no tile selector matched');
      return null;
    }

    console.log('🔗  Extracting first outbound link from tile');
    const url = await page.evaluate(s => {
      const tile = document.querySelector(s);
      if (!tile) return null;
      const a = tile.querySelector('a[href^="http"]');
      return a && !a.href.includes('google') ? a.href : null;
    }, sel);

    console.log('   → url =', url);
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
  res.send('GrabShop backend is up — POST JSON { image:dataURL }')
);

app.post('/detect', async (req, res) => {
  try {
    console.log('--- New /detect POST ---');
    const dataUrl = req.body.image || '';
    const b64     = dataUrl.split(',')[1];
    if (!b64) {
      console.log('   ✖ no base64 payload');
      return res.status(400).json({ url: null });
    }
    const buf = Buffer.from(b64, 'base64');
    const url = await lensToMerchant(buf);
    console.log('--- Responding with url →', url);
    res.json({ url: url || null });
  } catch (e) {
    console.error('🔥 error in /detect:', e);
    res.status(500).json({ url: null });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ Listening on http://0.0.0.0:${PORT}/detect`);
});
