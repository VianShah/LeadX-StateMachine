const path = require('path');
const express = require('express');
const config = require('./config');
const api = require('./routes/api');

const app = express();
app.use(express.json());
app.use('/api', api);
// no-cache = browsers may keep a copy but must re-check it on every load, so a
// pulled update shows up on a normal refresh instead of serving stale JS/CSS.
app.use(express.static(path.join(__dirname, '..', 'public'), {
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
}));

// Body-parser errors (oversized upload, malformed JSON) as JSON, not Express's HTML page.
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'file_too_large', message: 'The file is larger than 5 MB.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad_json' });
  next(err);
});

if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`LeadX demo server listening on http://localhost:${config.port}`);
  });
}

module.exports = app;
