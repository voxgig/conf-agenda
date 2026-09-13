// Does the dev REPL answer a real message? PLATFORM 4 lists the REPL as one
// of the six surfaces; SPEC 19.3 wants it connecting at Stage 1.
//   npm run local   # in another shell
//   node tool/repl-check.mjs
import Net from 'node:net'

const port = Number(process.env.REPL_PORT || 50502)
const send = process.argv[2] || 'aim:cag,list:room'

const sock = Net.connect(port, '127.0.0.1')
let out = ''
sock.setEncoding('utf8')
sock.on('data', (d) => { out += d })
sock.on('connect', () => setTimeout(() => sock.write(send + '\n'), 300))
setTimeout(() => {
  sock.end()
  const ok = /ok/.test(out) || /\[/.test(out)
  console.log('--- repl said ---')
  console.log(out.trim().slice(0, 400))
  console.log('---')
  console.log(ok ? 'REPL answered' : 'REPL did not answer')
  process.exit(ok ? 0 : 1)
}, 2500)
