// conf-agenda SPA entry: web components on a Seneca service bus. No framework —
// each component is a custom element; all data flows are bus messages, with
// aim:* travelling to the backend gateway via the seneca-browser transport.
// The UI is model-driven (see model.js): navigation, forms and entity
// relationships are generated from /model.json.

// The typeface, self-hosted the way voxgig.com self-hosts it - no CDN, no
// external request, works offline. `wght.css` is the variable normal-weight
// face across all subsets; each @font-face carries a unicode-range, so a
// browser fetches only the subset it needs (latin ~38KB, latin-ext another
// ~35KB for names like Kovac and Fontaine). Italics are not imported: the
// design does not use them.
import '@fontsource-variable/nunito/wght.css'

import './theme.css'
import './style.css'
import './theme.js'
import './bus.js'
import './cmp/auth.js'
import './cmp/public.js'
import './cmp/admin.js'
import './cmp/settings.js'
import './cmp/shell.js'
import './cmp/app.js'

// Custom entity views (ux:{view:'custom'}) — generated index of hand-coded views.
import './views.js'

// Project customisations: hook registrations + custom.css (create-once).
import './customise.js'
