const puppeteer = require('puppeteer-core')
;(async () => {
  const b = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
  })
  const p = await b.newPage()
  p.on('pageerror', (e) => console.log('PAGEERROR:', e.message))
  p.on('console', (m) => { if (m.type()==='error') console.log('CONSOLE.ERR:', m.text()) })
  await p.goto('http://localhost:3002/dev/min/', { waitUntil: 'networkidle0' })
  const text = await p.evaluate(() => document.body.innerText.slice(0, 200))
  console.log('text:', text)
  await b.close()
})()
