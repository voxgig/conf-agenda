// Dev tool: render the test page and capture it, for eyeballing a change.
//   node tool/screenshot.mjs
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFileSync, existsSync, globSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { homedir } from 'node:os'

const ROOT = process.cwd()
const TYPES = { '.html':'text/html', '.mjs':'text/javascript', '.js':'text/javascript', '.json':'application/json' }
const server = createServer((req,res)=>{
  const rel = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/,'')
  const f = join(ROOT, rel)
  if(!existsSync(f)) return res.writeHead(404).end('nf')
  res.writeHead(200,{'content-type':TYPES[extname(f)]||'application/octet-stream'}); res.end(readFileSync(f))
})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
const base='http://127.0.0.1:'+server.address().port
const exe = globSync(join(homedir(),'.cache/ms-playwright/chromium-*/chrome-linux/chrome'))[0]
const browser = await chromium.launch(exe?{executablePath:exe}:{})
const page = await browser.newPage({ viewport:{width:1000,height:1000} })
await page.goto(base+'/test/index.html')
await page.waitForFunction(()=>document.querySelector('#a')?.shadowRoot?.querySelector('table'))
await page.screenshot({ path:'test/embed-render.png', fullPage:true })
console.log('screenshot written')
await browser.close(); server.close(); process.exit(0)
