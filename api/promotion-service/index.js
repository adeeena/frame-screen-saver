const express = require('express');
const moment = require('moment-timezone');
const config = require('../config');
const app = express();
const PORT = process.env.PORT || 3001;

app.get('/api/clock', (req, res) => {
  const timezone = config.timezone || 'UTC'; // Fallback to UTC if not specified
  const now = moment.tz(timezone);

  res.json({
    time: now.format('YYYY-MM-DD HH:mm:ss'),
    timezone: timezone,
    utcOffset: now.format('Z')
  });
});

app.listen(PORT, () => {
  console.log(`Clock Service is running on port ${PORT}`);
});
