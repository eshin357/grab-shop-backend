// backend.js — just Lens → Shopping → first merchant
const express   = require('express');
const cors      = require('cors');
const puppeteer = require('puppeteer-extra');
const Stealth   = require('puppeteer-extra-plugin-stealth');
const fs        = require('fs');
const os        = require('os');
const path      = require('path');

puppeteer.use(Stealth());

const HEADLESS = process.env.NODE_ENV === 'production';
const UA = 'Mozilla/5.0 (Windows NT 10; Win64; x64) ' +
           'AppleWebKit/537.36 (KHTML, like Gecko) ' +
           'Chrome/124.0.0.0 Safari/537.36';

const TILE_SELECTORS = [
  'div.kbOPBd.cvP2Ce',
  'div.sh-dgr__grid-result',
  'div.N54PNb.BToiNc',
  'div[data-docid] div[jsname][role="link"]'
];

async function waitIfCaptcha(page) {
  const SEL = 'form#captcha-form, div.g-recaptcha, iframe[src*="recaptcha"]';
  if (await page.$(SEL)) {
    console.log('⚠️ CAPTCHA — solve in UI if visible');
    await page.waitForFunction(s => !document.querySelector(s),
      { polling:1500, timeout:0 }, SEL);
    console.log('🙂 CAPTCHA gone');
  }
}

async function lensToMerchant(buffer) {
  const browser = await puppeteer.launch({
    headless: HEADLESS ? 'new' : false,
    args: [
      ...(HEADLESS ? [] : ['--start-maximized']),
      '--no-sandbox','--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled'
    ],
    defaultViewport: null
  });

  const tmp = path.join(os.tmpdir(), `img-${Date.now()}.png`);
  fs.writeFileSync(tmp, buffer);

  try {
    const [page] = await browser.pages();
    await page.setUserAgent(UA);
    await page.setExtraHTTPHeaders({ 'Accept-Language':'en-US' });
    await page.goto('https://images.google.com/', { waitUntil:'networkidle2' });
    await waitIfCaptcha(page);
    await page.click('div[aria-label="Search by image"]');

    const input = await page.waitForSelector('input[type=file]');
    await input.uploadFile(tmp);
    await page.waitForNavigation({ waitUntil:'networkidle2' });
    await waitIfCaptcha(page);

    // optional “Products” tab
    const switched = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('a,button')]
        .find(el => /Products|Shopping/i.test(el.innerText||''));
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (switched) {
      await page.waitForNavigation({ timeout:5000, waitUntil:'domcontentloaded' })
        .catch(()=>{/*ignore*/});
      await waitIfCaptcha(page);
    }

    // find first tile
    let sel = null;
    for (const s of TILE_SELECTORS) {
      if (await page.$(s)) { sel = s; break; }
    }
    if (!sel) return null;

    // grab first merchant link
    const url = await page.evaluate(s => {
      const tile = document.querySelector(s);
      const a = tile?.querySelector('a[href^="http"]');
      return a && !a.href.includes('google') ? a.href : null;
    }, sel);

    return url;
  } finally {
    fs.unlink(tmp, ()=>{});
    if (HEADLESS) await browser.close();
  }
}

// ─── Express API ───
const app = express();
app.use(cors());
app.use(express.json({ limit:'6mb' }));

app.get('/detect', (_req,res) =>
  res.send('Send POST { image:dataURL }')
);

app.post('/detect', async (req,res) => {
  try {
    const b64 = (req.body.image||'').split(',')[1];
    const buf = Buffer.from(b64||'', 'base64');
    if (!buf.length) return res.json({ url: null });

    console.log('🔍 got image, launching Lens…');
    const url = await lensToMerchant(buf);
    console.log('🛒 merchant URL →', url);
    res.json({ url: url||null });
  } catch (e) {
    console.error(e);
    res.json({ url: null });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log(`🚀 listening on http://0.0.0.0:${PORT}/detect`));
