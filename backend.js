// backend.js — Lens → 1st merchant, no Vision dependency

const express   = require('express');
const cors      = require('cors');
const fs        = require('fs');
const os        = require('os');
const path      = require('path');
const puppeteer = require('puppeteer-extra');
const Stealth   = require('puppeteer-extra-plugin-stealth');
puppeteer.use(Stealth());

// headless in PROD or if HEADLESS=true
const HEADLESS =
  process.env.NODE_ENV === 'production' ||
  /^(1|true)$/i.test(process.env.HEADLESS || '');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const TILE_SELECTORS = [
  'div.kbOPBd.cvP2Ce',                   // grid layout
  'div.sh-dgr__grid-result',             // older grid
  'div.N54PNb.BToiNc',                   // list layout
  'div[data-docid] div[jsname][role="link"]' // side-panel
];

// if they hit a CAPTCHA, wait forever (so user can solve)
async function waitIfCaptcha(page, label) {
  const SEL = 'form#captcha-form, div.g-recaptcha, iframe[src*="recaptcha"]';
  if (await page.$(SEL)) {
    console.log(`⚠️ CAPTCHA on ${label}. Solve it in the window…`);
    await page.waitForFunction(
      s => !document.querySelector(s),
      { polling: 1500, timeout: 0 },
      SEL
    );
    console.log(`🙂 CAPTCHA solved (${label}) — continuing`);
  }
}

async function lensToMerchant(buffer) {
  // 1) launch Chrome
  const browser = await puppeteer.launch({
    headless: HEADLESS ? 'new' : false,
    slowMo:   HEADLESS ? 0 : 35,
    defaultViewport: null,
    args: [
      ...(HEADLESS ? [] : ['--start-maximized']),
      '--lang=en-US',
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });

  // write image to tmp
  const png = path.join(os.tmpdir(), `snippet-${Date.now()}.png`);
  fs.writeFileSync(png, buffer);

  try {
    const [page] = await browser.pages();
    await page.setUserAgent(UA);
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US' });
    await page.emulateTimezone('America/Los_Angeles');

    // 2) go to Google Images → “Search by image”
    await page.goto('https://images.google.com/', { waitUntil: 'networkidle2' });
    await waitIfCaptcha(page, 'Google Images');
    await page.click('div[aria-label="Search by image"]');

    // 3) upload our PNG
    const fileInput = await page.waitForSelector('input[type=file]');
    await fileInput.uploadFile(png);
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
    await waitIfCaptcha(page, 'Lens results');

    // 4) switch to “Products / Shopping” tab if present
    const switched = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('a,button')]
        .find(e => /Products|Shopping/i.test(e.innerText?.trim()));
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (switched) {
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5000 })
                .catch(()=>{});
      await waitIfCaptcha(page, 'Products tab');
    }

    // 5) find the first product tile
    let tileSel = null;
    for (const sel of TILE_SELECTORS) {
      try {
        await page.waitForSelector(sel, { timeout: 1500 });
        tileSel = sel;
        break;
      } catch {}
    }
    if (!tileSel) return null;

    // 6) grab the first external merchant link
    const url = await page.evaluate(sel => {
      const tile = document.querySelector(sel);
      if (!tile) return null;
      const a = tile.querySelector('a[href^="http"]');
      return (a && !a.href.includes('google.com')) ? a.href : null;
    }, tileSel);

    // in DEV, if it opened a new tab, bring it forward
    if (url && !HEADLESS) {
      const target = await browser.waitForTarget(t => t.url() === url, { timeout: 3000 }).catch(()=>null);
      if (target) (await target.page()).bringToFront().catch(()=>{});
    }

    return url || null;
  } finally {
    fs.unlink(png, ()=>{});
    if (HEADLESS) await browser.close();
  }
}

// ─── Express API ───
const app = express();
app.use(cors());
app.use(express.json({ limit: '6mb' }));

app.get('/detect', (_req, res) => {
  res.send('📸 POST { image: dataURL } → { url }');
});

app.post('/detect', async (req, res) => {
  const b64 = (req.body.image||'').split(',')[1];
  if (!b64) return res.status(400).json({ url: null });
  const buf = Buffer.from(b64, 'base64');

  try {
    const url = await lensToMerchant(buf);
    console.log('→ merchantURL =', url||'NONE');
    res.json({ url: url||null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ url: null });
  }
});

const PORT = process.env.PORT||3000;
app.listen(PORT, '0.0.0.0', () =>
  console.log(`✅ Listening on http://0.0.0.0:${PORT}/detect`)
);
