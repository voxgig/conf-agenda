//// The `cag` service: validation, publication and the segment intents.
////
//// Entity operations stay INTERNAL, behind these messages - there is no
//// generic ent service (SPEC 9), and no entity operation reaches the browser.
//// The rules those operations share live in concerns (concern:tenant,
//// concern:fixture), called over the bus, never reimplemented here.
////
//// MakeSrv auto-loads one action file per declared message:
//// validate:fixture -> ./validate_fixture

import { MakeSrv } from '@voxgig/system'

module.exports = MakeSrv('cag', require)
