const test = require('node:test');
const assert = require('node:assert/strict');

const cold = require('../lib/cold');
const sm = require('../lib/stateMachine');
const voices = require('../voiceCatalog');
const { parseList } = require('../lib/listParser');
const ExcelJS = require('exceljs');

const [maya, ria, vijay] = voices;
const row = (o) => ({ Name: 'Test', Phone: '9876543210', CIBIL: '760', City: 'Delhi', Occupation: 'Salaried', 'Monthly Income': '70000', ...o });

test('column names are matched loosely and unknown columns reported', () => {
  const { detected, ignored } = cold.mapColumns([{ 'Customer Name': 'a', 'Mobile No.': '1', cibil_score: '700', 'Favourite colour': 'x' }]);
  assert.deepEqual(detected.map((d) => d.field).sort(), ['cibil', 'name', 'phone']);
  assert.deepEqual(ignored, ['Favourite colour']);
});

test('phone numbers are normalised to 10-digit Indian mobiles', () => {
  assert.equal(cold.normalizePhone('+91 98765-43210'), '9876543210');
  assert.equal(cold.normalizePhone('09876543210'), '9876543210');
  assert.equal(cold.normalizePhone('12345'), null);
  assert.equal(cold.normalizePhone('5876543210'), null); // Indian mobiles start 6-9
});

test('invalid, duplicate, DND and below-cutoff rows are excluded with a reason', () => {
  const { leads, excluded, intake } = cold.analyze([
    row({ Phone: '12' }),
    row({ Phone: '9000000001' }),
    row({ Phone: '9000000001' }),
    row({ Phone: '9000000002', DND: 'Yes' }),
    row({ Phone: '9000000003', CIBIL: '600' }),
    row({ Phone: '9000000004', CIBIL: '' }), // missing CIBIL is kept, not guessed
  ], maya, voices);
  assert.deepEqual(excluded.map((e) => e.reason), ['invalid_phone', 'duplicate', 'dnd', 'below_cutoff']);
  assert.equal(leads.length, 2);
  assert.equal(leads[1].cibilDisplay, 'Pending bureau pull');
  assert.equal(intake.missing.cibil, 1);
});

test('language: list value wins, else inferred; uncovered languages bridge to English', () => {
  const { leads } = cold.analyze([
    row({ Phone: '9000000011', Language: 'marathi' }),
    row({ Phone: '9000000012', City: 'Chennai', Occupation: 'Retired' }),
    row({ Phone: '9000000013', City: 'Pune', Occupation: 'Self-employed' }),
  ], ria, voices);
  assert.equal(leads[0].language, 'Marathi');
  assert.equal(leads[0].languageSource, 'From the list');
  assert.equal(leads[0].voiceId, 'vijay'); // Ria does not speak Marathi, Vijay does
  assert.equal(leads[1].language, 'Tamil');
  assert.equal(leads[1].callLanguage, 'English');
  assert.equal(leads[1].voiceId, 'ria'); // the chosen agent keeps leads it can call
  assert.equal(leads[2].need, 'Business Loan');
});

test('bucket decides how to call: hot direct, warm/cold get a warm-up and fewer attempts', () => {
  const { leads } = cold.analyze([
    row({ Phone: '9000000021', CIBIL: '880', 'Monthly Income': '200000', Language: 'Hindi' }),
    row({ Phone: '9000000022', CIBIL: '', 'Monthly Income': '', Occupation: '', City: '' }),
  ], maya, voices);
  const hot = leads.find((l) => l.bucket === 'hot');
  const cool = leads.find((l) => l.bucket === 'cold');
  assert.ok(hot && cool);
  assert.equal(hot.plan.warmup, null);
  assert.equal(cool.plan.warmup, 'SMS');
  assert.ok(cool.plan.maxAttempts < hot.plan.maxAttempts);
});

test('cold leads walk queued -> warmup -> dialing, and never exceed their attempt budget', () => {
  const { leads } = cold.analyze(cold.sampleRows(), maya, voices);
  const declared = new Set(sm.EDGES.map((e) => `${e.from}>${e.to}`));
  for (const lead of leads) {
    const voice = voices.find((v) => v.id === lead.voiceId);
    let state = 'queued', attempt = 0, dials = 0;
    const path = [state];
    for (let i = 0; i < 40; i++) {
      const step = sm.decide(state, { lead, voice, seed: 's', attempt });
      if (!step) break;
      assert.ok(declared.has(`${state}>${step.to}`));
      if (step.to === 'dialing') { attempt += 1; dials += 1; }
      state = step.to; path.push(state);
    }
    assert.ok(state === 'won' || state === 'lost');
    assert.ok(dials <= lead.plan.maxAttempts);
    assert.equal(path[1], lead.plan.warmup ? 'warmup' : 'dialing');
  }
});

test('xlsx and csv uploads parse to the same rows', async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Leads');
  ws.addRow(['Name', 'Mobile Number', 'CIBIL Score']);
  ws.addRow(['Asha', 9876543210, 742]);
  ws.addRow([]);
  ws.addRow(['Ravi', '+91 91234 56789', 701]);
  const xlsxRows = await parseList(Buffer.from(await wb.xlsx.writeBuffer()), 'leads.xlsx');
  const csvRows = await parseList(Buffer.from('Name,Mobile Number,CIBIL Score\nAsha,9876543210,742\n\nRavi,+91 91234 56789,701\n'), 'leads.csv');
  assert.deepEqual(xlsxRows, csvRows);
});

test('unsupported and empty files get a clear error code', async () => {
  await assert.rejects(parseList(Buffer.from('x'), 'a.xls'), { code: 'old_excel' });
  await assert.rejects(parseList(Buffer.from('x'), 'a.pdf'), { code: 'unsupported' });
  await assert.rejects(parseList(Buffer.from('Name,Phone\n'), 'a.csv'), { code: 'empty' });
});
