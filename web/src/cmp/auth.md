# Component: vg-auth (`cmp/auth.js`)

The sign-in form (with forgot-password), and the client-side `cmp:auth`
state service other components query.

## Message flow

```mermaid
sequenceDiagram
  participant U as User
  participant A as vg-auth
  participant G as gateway (backend)
  U->>A: submit email + password
  A->>G: aim:req,on:auth,signin:user
  G-->>A: { ok, user }
  A->>A: emit 'auth' event (cmp:evt,name:auth)
  Note over A: vg-app re-routes to the shell
```

## Messages

| Message | Direction | Purpose |
|---|---|---|
| `cmp:auth,load:state` | answers | Load the session (`aim:req,on:auth,load:auth`) |
| `cmp:auth,get:state` | answers | Current `{ user }` for other components |
| `cmp:auth,signin:user` | answers | Sign in, then emit `auth` |
| `cmp:auth,signout:user` | answers | Sign out, then emit `auth` |
| `aim:req,on:auth,remind:pass` | post | Forgot-password (server stub; no email sent) |
| event `auth` | emit | Auth state changed (the store cache also clears on this) |

## Customisation

| Hook point | Kind | Effect |
|---|---|---|
| `auth:form:footer` | html | Extra links/markup under the form |
