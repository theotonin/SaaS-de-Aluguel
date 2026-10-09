import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReportPeriod, reportCsv, exactMoney } from '../apps/api/finance-report.ts';

test('finance report uses inclusive São Paulo dates converted to half-open boundaries', () => {
  assert.deepEqual(parseReportPeriod(new URLSearchParams('from=2026-10-01&to=2026-10-31')), { from: '2026-10-01', until: '2026-11-01' });
  assert.throws(() => parseReportPeriod(new URLSearchParams('from=2026-10-02&to=2026-10-01')));
  assert.throws(() => parseReportPeriod(new URLSearchParams('from=2026-10-01')));
});

test('CSV quotes fields and neutralizes spreadsheet formulas; money stays in minor units', () => {
  const report = { from: '2026-10-01', to: '2026-10-31', received: '125', receivable: '0', depositReceived: '0', depositRefunded: '0', depositMovement: '0', depositHeld: '0', expenses: '-50', operatingNet: '175', cashNet: '175' };
  const csv = reportCsv(report, '=@SUM(A1)');
  assert.ok(csv.includes("'=@SUM(A1)"));
  assert.ok(csv.includes('"\'-50"'));
  assert.equal(exactMoney('9007199254740993'), 'R$ 90.071.992.547.409,93');
});
