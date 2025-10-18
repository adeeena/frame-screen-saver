const express = require('express');
const axios = require('axios');
const moment = require('moment-timezone');
const communicator = require('../communicator');
const config = require('../config');
const app = express();
const PORT = process.env.PORT || 3003;

let cache = {
  data: null,
  expiresAt: null, // This will be a moment object
};

const getSolarDataForDate = async (date, offset, location) => {
  const apiUrl = new URL('https://api.met.no/weatherapi/sunrise/3.0/sun');
  apiUrl.searchParams.append('lat', location.latitude);
  apiUrl.searchParams.append('lon', location.longitude);
  apiUrl.searchParams.append('date', date);
  apiUrl.searchParams.append('offset', offset);

  const response = await axios.get(apiUrl.toString(), {
    headers: {
      'User-Agent': 'frame-screen-saver-server/1.0.0',
    },
  });
  return response.data.properties;
};

// https://medium.com/@azizmarzouki/mastering-microservices-with-node-js-a-step-by-step-guide-0aa0020cd27a
// https://api.met.no/weatherapi/sunrise/3.0/documentation
// Blindern, Oslo
// https://api.met.no/weatherapi/sunrise/3.0/sun?lat=59.933333&lon=10.716667&date=2025-09-19&offset=+01:00
app.get('/api/solar/next-event', async (req, res) => {
  try {
    // 1. Check cache first
    const nowForCacheCheck = moment.tz(config.timezone);
    if (cache.data && cache.expiresAt && nowForCacheCheck.isBefore(cache.expiresAt)) {
      console.log('Returning solar event from cache: ' + JSON.stringify(cache.data));
      return res.json(cache.data);
    }

    console.log('Cache miss or expired. Recalculating solar event.');

    const { location } = config;

    if (!location || !location.latitude || !location.longitude) {
      return res.status(412).json({
        message: 'Solar service: location data is missing in the configuration.',
      });
    }

    // Get current date and offset from the clock service
    const clockData = await communicator.getClock();
    const now = moment.tz(clockData.time, 'YYYY-MM-DD HH:mm:ss', clockData.timezone);
    
    // 2. Fetch solar data for today
    const todaySolarData = await getSolarDataForDate(now.format('YYYY-MM-DD'), clockData.utcOffset, location);
    const todaySunrise = moment(todaySolarData.sunrise.time);
    const todaySunset = moment(todaySolarData.sunset.time);

    let nextEvent = {};
    
    // 3. Determine the next event
    if (now.isBefore(todaySunrise)) {
      // Case 1: Before today's sunrise -> next event is today's sunrise
      nextEvent = {
        type: 'sunrise',
        time: todaySunrise,
      };
    } else if (now.isBefore(todaySunset)) {
      // Case 2: Before today's sunset -> next event is today's sunset
      nextEvent = {
        type: 'sunset',
        time: todaySunset,
      };
    } else {
      // Case 3: After today's sunset -> next event is tomorrow's sunrise
      const tomorrow = now.clone().add(1, 'day'); // Use clone() to avoid mutating `now`
      const tomorrowSolarData = await getSolarDataForDate(tomorrow.format('YYYY-MM-DD'), clockData.utcOffset, location);
      nextEvent = {
        type: 'sunrise',
        time: moment(tomorrowSolarData.sunrise.time),
      };
    }
    
    // 4. Format the response and update the cache
    const responseData = {
      type: nextEvent.type,
      time: nextEvent.time.format('YYYY-MM-DD HH:mm:ss'),
      utcOffset: nextEvent.time.format('Z'),
    };

    cache = {
      data: responseData,
      expiresAt: nextEvent.time, // The event time itself is the expiration time
    };
    console.log(`Solar event cached. Expires at: ${cache.expiresAt.format()}`);

    res.json(responseData);
  } catch (error) {
    console.error('Error in Solar Service:', error.message);
    if (error.response) {
      res.status(error.response.status).json({ message: 'Error from external API', details: error.response.data });
    } else {
      res.status(500).json({ message: 'Internal Server Error' });
    }
  }
});

app.listen(PORT, () => {
  console.log(`Solar Service is running on port ${PORT}`);
});
