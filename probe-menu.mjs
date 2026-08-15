import { createRequire } from 'module'
const require = createRequire('C:/Users/Patri/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/x.js')
const { chromium } = require('playwright')
import { mkdirSync } from 'fs'
mkdirSync('probe-out', { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] })
const page = await (await browser.newContext({ viewport: { width: 1771, height: 888 } })).newPage()
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)))
await page.goto('http://localhost:5174/', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.menu-rpg-buttons', { timeout: 90_000 })
await page.waitForTimeout(3000)
await page.screenshot({ path: 'probe-out/menu-redesign.png' })
// click a different hero to confirm status bar updates
await page.screenshot({ path: 'probe-out/menu-redesign-2.png' })
await browser.close()
console.log('done')
