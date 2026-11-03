const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require('node:path').join(__dirname, '../src/index.js'), 'utf8');
const attendanceFunction = source.slice(source.indexOf('async function isAdminAttending('), source.indexOf('async function getCustomResponse('));
const daysConstant = source.match(/const HUMAN_ATTENDANCE_DAYS = \d+;/)[0];

async function checkAttendance(messageAgesDays) {
  const now = Date.now();
  let cutoff;
  const query = {
    select() { return this; },
    in() { return this; },
    eq() { return this; },
    gte(column, value) { cutoff = new Date(value).getTime(); return this; },
    order() { return this; },
    limit() {
      const latest = messageAgesDays.map(days => now - days * 86400000).filter(time => time >= cutoff).sort((a, b) => b - a)[0];
      return Promise.resolve({ data: latest ? [{ phone_number: 'test', created_at: new Date(latest).toISOString() }] : [], error: null });
    }
  };
  const context = { supabase: { from: () => query }, getLidFromPhone: async () => null, console: { log() {} }, Date };
  return vm.runInNewContext(`${daysConstant}\n${attendanceFunction}\nisAdminAttending('test')`, context);
}

test('human attendance remains active for 29 days', async () => {
  assert.equal(await checkAttendance([29]), true);
});

test('human attendance expires after 31 days', async () => {
  assert.equal(await checkAttendance([31]), false);
});

test('a newer staff message renews human attendance', async () => {
  assert.equal(await checkAttendance([31, 1]), true);
});
