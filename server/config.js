require('dotenv').config();

function int(name, fallback) {
  const v = parseInt(process.env[name], 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

module.exports = {
  port: int('PORT', 3001),
  stepDelayMs: int('STEP_DELAY_MS', 1100),
  concurrency: int('RUN_CONCURRENCY', 5),
  defaultLeadCount: int('DEFAULT_LEAD_COUNT', 20),
  maxLeadCount: 60,
};
