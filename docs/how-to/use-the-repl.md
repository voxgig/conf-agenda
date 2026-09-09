# How to use the Seneca REPL

*Diátaxis: how-to guide - poke the running system with live messages.*

The local dev runners (`npm run local`, `npm run web`) start a
[Seneca REPL](https://github.com/senecajs/seneca-repl) on the model's
`conf.port.repl` (default **50502**). Environment overrides:
`REPL_PORT=<port>`, `REPL=false` to disable.

## Connect

```bash
npx seneca-repl telnet://localhost:50502
```

The client auto-reconnects, so you can restart the backend without
restarting the REPL.

## Try it

```
list                       # all action patterns
list aim:thing             # patterns matching a pin
aim:thing,get:info         # post a message to the running system
stats                      # instance statistics
seneca.entity('app/thing').list$()   # inspect entities directly
```

Any line is parsed as a jsonic Seneca message and posted to the running
instance - the same messages your services and tests use. Note that
REPL messages carry no signed-in principal, so user-scoped actions see
no user; inspect entities directly for raw data.
