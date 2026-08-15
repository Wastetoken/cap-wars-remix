import { createRequire } from 'module'
const require = createRequire('C:/Users/Patri/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/x.js')
const { chromium } = require('playwright')

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] })
const page = await (await browser.newContext({ viewport: { width: 1771, height: 888 } })).newPage()
await page.goto('http://localhost:5174/', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.menu-rpg-buttons', { timeout: 90_000 })
await page.waitForTimeout(1500)
// hide both canvases
await page.evaluate(() => {
  document.querySelectorAll('canvas').forEach((c) => { c.style.display = 'none' })
})
await page.waitForTimeout(300)
await page.locator('.menu-rpg-bottom').screenshot({ path: 'probe-out/bar-nocanvas.png' })
await browser.close()
console.log('done')
