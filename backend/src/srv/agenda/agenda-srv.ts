//// The `agenda` service: the public read path, and nothing else.
////
//// Deliberately separate from `cag`. Everything here is anonymous and reads
//// only the published snapshot - it never touches a live entity row, so there
//// is no code path from the public surface to draft or private data.

import { MakeSrv } from '@voxgig/system'

module.exports = MakeSrv('agenda', require)
