const path = require('path');
const express = require('express');
const config = require('./config');
const api = require('./routes/api');

const app = express();
app.use(express.json());
app.use('/api', api);
app.use(express.static(path.join(__dirname, '..', 'public')));

if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`LeadX demo server listening on http://localhost:${config.port}`);
  });
}

module.exports = app;
