// backend.js — Lens → 1st merchant (no Google Vision)
const express   = require('express');
const cors      = require('cors');
const puppeteer = require('puppeteer-extra');
const Stealth   = require('puppeteer-extra-plugin-stealth');
const fs        = require('fs');
const os        = require('os');
const path      = require('path');

puppeteer.use(Stealth());

const HEADLESS = process.env.HEADLESS === 'false' ? false : true;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
           'AppleWebKit/537.36 (KHTML, like Gecko) ' +
           'Chrome/124.0.0.0 Safari/537.36';

const TILE_SELECTORS = [
  'div.kbOPBd.cvP2Ce',
  'div.sh-dgr__grid-result',
  'div.N54PNb.BToiNc',
  'div[data-docid] div[jsname][role="link"]'
];

async function waitIfCaptcha(page,label){
  const SEL = 'form#captcha-form, div.g-recaptcha, iframe[src*="recaptcha"]';
  if (await page.$(SEL)){
    console.log(`⚠️ CAPTCHA on ${label}, solve in browser…`);
    await page.waitForFunction(s=>!document.querySelector(s),
      { polling:1500, timeout:0 }, SEL);
    console.log(`🙂 CAPTCHA cleared (${label})`);
  }
}

async function lensToMerchant(buffer){
  const browser = await puppeteer.launch({
    headless: HEADLESS,
    slowMo:   HEADLESS?0:35,
    defaultViewport: null,
    args: [
      ...(HEADLESS?[]:['--start-maximized']),
      '--lang=en-US',
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox','--disable-setuid-sandbox'
    ]
  });

  // write temp file
  const png = path.join(os.tmpdir(),`snippet-${Date.now()}.png`);
  fs.writeFileSync(png, buffer);

  try {
    const [page] = await browser.pages();
    await page.setUserAgent(UA);
    await page.setExtraHTTPHeaders({ 'Accept-Language':'en-US' });

    // 1) go to Google Images → Search by image
    await page.goto('https://images.google.com/', { waitUntil:'networkidle2' });
    await waitIfCaptcha(page,'Google Images');
    await page.click('div[aria-label="Search by image"]');

    // 2) upload
    const fileInput = await page.waitForSelector('input[type=file]');
    await fileInput.uploadFile(png);
    await page.waitForNavigation({ waitUntil:'networkidle2' });
    await waitIfCaptcha(page,'Lens results');

    // 3) switch to Products/Shopping
    const switched = await page.evaluate(()=>{
      const btn = [...document.querySelectorAll('a,button')]
        .find(el=>/Products|Shopping/i.test(el.innerText?.trim()));
      if(btn){ btn.click(); return true; }
      return false;
    });
    if(switched){
      await page.waitForNavigation({ waitUntil:'domcontentloaded', timeout:5000 }).catch(()=>{});
      await waitIfCaptcha(page,'Products tab');
    }

    // 4) find first tile
    let sel = null;
    for(const s of TILE_SELECTORS){
      try { await page.waitForSelector(s,{timeout:1500}); sel=s; break; }
      catch{}
    }
    if(!sel) return null;

    // 5) grab merchant link
    const url = await page.evaluate(s=>{
      const t = document.querySelector(s);
      const a = t?.querySelector('a[href^="http"]');
      return (a && !a.href.includes('google.com')) ? a.href : null;
    }, sel);

    // 6) in DEV bring it front
    if(url && !HEADLESS){
      const t = await browser.waitForTarget(t=>t.url()===url,{timeout:3000}).catch(()=>null);
      if(t) (await t.page()).bringToFront().catch(()=>{});
    }

    return url;
  } finally {
    fs.unlink(png,()=>{});
    if(HEADLESS) await browser.close();
  }
}

// ─── Express JSON API ───
const app = express();
app.use(cors());
app.use(express.json({ limit:'6mb' }));

app.get('/detect', (_,res)=> res.send('Up'));
app.post('/detect', async (req,res)=>{
  const b64 = (req.body.image||'').split(',')[1];
  if(!b64) return res.status(400).json({url:null});
  try {
    const buf = Buffer.from(b64,'base64');
    const url = await lensToMerchant(buf);
    res.json({url});
  } catch(e) {
    console.error(e);
    res.json({url:null});
  }
});

const PORT = process.env.PORT||3000;
app.listen(PORT,'0.0.0.0',()=>{
  console.log(`✅ Listening on http://0.0.0.0:${PORT}/detect`);
});
