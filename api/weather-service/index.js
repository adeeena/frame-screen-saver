const express = require('express');
const communicator = require('../communicator');
const config = require('../config');
const app = express();
const PORT = process.env.PORT || 3002;

// https://medium.com/@azizmarzouki/mastering-microservices-with-node-js-a-step-by-step-guide-0aa0020cd27a
app.get('/api/weather', async (req, res) => {
  const location = config.location || null;

  if (!location) {
    res.status(412).json({
      message: 'Weather service: no location provided.'
    })
  }

  const clockData = await communicator.getClock();
  console.dir(clockData);

  res.json({ weather: 'very good' });
});



app.listen(PORT, () => {
  console.log(`Weather Service is running on port ${PORT}`);
});
