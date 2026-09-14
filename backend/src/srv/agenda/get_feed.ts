//// aim:agenda,get:feed - .ics and .csv, derived from the published snapshot.
////
//// Anonymous, like get:agenda. Both formats are built FROM agenda.json rather
//// than from live rows, so a feed cannot contain anything the public agenda
//// does not - by construction, not by a second set of filters.

const { buildIcs, buildCsv } = require('../../lib/ics')

const TYPE: Record<string, string> = {
  ics: 'text/calendar; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
}

module.exports = function make_get_feed() {
  return async function get_feed(this: any, msg: any) {
    const seneca = this
    const format = msg.format || 'ics'

    if (!TYPE[format]) {
      return { ok: false, why: 'unknown-format', formats: Object.keys(TYPE) }
    }

    const snapshot = await seneca.entity('cag/snapshot').load$(msg.org_id + ':' + msg.slug)
    if (null == snapshot) {
      return { ok: false, why: 'not-published' }
    }

    const agenda = JSON.parse(snapshot.agenda_json)
    const body = 'ics' === format ? buildIcs(agenda) : buildCsv(agenda)

    return {
      ok: true,
      format,
      content_type: TYPE[format],
      filename: msg.slug + '.' + format,
      body,
    }
  }
}
