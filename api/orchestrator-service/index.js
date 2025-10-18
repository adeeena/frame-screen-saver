const express = require('express');
const cors = require('cors');
const communicator = require('../communicator');
const app = express();
const PORT = process.env.PORT || 3000;

// CORS Configuration
const corsOptions = {
  origin: 'http://localhost:4200', // Allow requests from your frontend
};

app.use(cors(corsOptions));

app.get('/api/clock', async (req, res) => {
  try {
    // Concurrently fetch data from both services for better performance
    const [clockData] = await Promise.all([
      communicator.getClock(),
    ]);

    // Combine the results into a single object
    const dashboardData = {
      ...clockData
    };

    res.json(dashboardData);
  } catch (error) {
    console.error('Error in orchestrator:', error.message);
    // Basic error handling to inform the client if a downstream service fails
    if (error.response) {
      res.status(502).json({ message: 'Error from downstream service', service: error.config.baseURL });
    } else if (error.request) {
      res.status(503).json({ message: 'Downstream service unavailable', service: error.config.baseURL });
    } else {
      res.status(500).json({ message: 'Internal Server Error in orchestrator' });
    }
  }
});

app.get('/api/weather', async (req, res) => {
  try {
    const [weatherData] = await Promise.all([
      communicator.getWeather(),
    ]);

    // Combine the results into a single object
    const dashboardData = {
      ...weatherData
    };

    res.json(dashboardData);
  } catch (error) {
    console.error('Error in orchestrator:', error.message);
    // Basic error handling to inform the client if a downstream service fails
    if (error.response) {
      res.status(502).json({ message: 'Error from downstream service', service: error.config.baseURL });
    } else if (error.request) {
      res.status(503).json({ message: 'Downstream service unavailable', service: error.config.baseURL });
    } else {
      res.status(500).json({ message: 'Internal Server Error in orchestrator' });
    }
  }
});

app.get('/api/solar/next-event', async (req, res) => {
  try {
    const [solarNextEventData] = await Promise.all([
      communicator.getSolarNextEvent(),
    ]);

    // Combine the results into a single object
    const dashboardData = {
      ...solarNextEventData
    };

    res.json(dashboardData);
  } catch (error) {
    console.error('Error in orchestrator:', error.message);
    // Basic error handling to inform the client if a downstream service fails
    if (error.response) {
      res.status(502).json({ message: 'Error from downstream service', service: error.config.baseURL });
    } else if (error.request) {
      res.status(503).json({ message: 'Downstream service unavailable', service: error.config.baseURL });
    } else {
      res.status(500).json({ message: 'Internal Server Error in orchestrator' });
    }
  }
});

app.listen(PORT, () => {
  console.log(`Orchestrator Service is running on port ${PORT}`);
});
