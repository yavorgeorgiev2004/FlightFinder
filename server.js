// Amadeus API backend proxy
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

let amadeusToken = null;
let tokenExpiry = 0;

async function getAmadeusToken() {
  if (amadeusToken && Date.now() < tokenExpiry) return amadeusToken;
  const { AMADEUS_CLIENT_ID, AMADEUS_CLIENT_SECRET } = process.env;
  const res = await axios.post('https://test.api.amadeus.com/v1/security/oauth2/token',
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: AMADEUS_CLIENT_ID,
      client_secret: AMADEUS_CLIENT_SECRET
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  amadeusToken = res.data.access_token;
  tokenExpiry = Date.now() + (res.data.expires_in - 60) * 1000;
  return amadeusToken;
}

app.get('/api/autocomplete', async (req, res) => {
  const { keyword } = req.query;
  try {
    const token = await getAmadeusToken();
    const result = await axios.get('https://test.api.amadeus.com/v1/reference-data/locations', {
      params: {
        keyword,
        subType: 'AIRPORT,CITY',
        'page[limit]': 10
      },
      headers: { Authorization: `Bearer ${token}` }
    });
    res.json(result.data.data);
  } catch (err) {
    res.status(500).json({ error: 'Autocomplete failed', details: err.message });
  }
});

// Proxy endpoint for Amadeus flight search
app.get('/api/flights', async (req, res) => {
  const { origin, destination, depart_date, return_date, cabinClass, adults, children, infants } = req.query;

  try {
    // Step 1: Get Amadeus access token
    const tokenResponse = await fetch('https://test.api.amadeus.com/v1/security/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.AMADEUS_CLIENT_ID,
        client_secret: process.env.AMADEUS_CLIENT_SECRET
      })
    });

    if (!tokenResponse.ok) {
      return res.status(500).json({ error: 'Failed to fetch Amadeus access token' });
    }

    const { access_token } = await tokenResponse.json();

    // Step 2: Search for flights
    const searchParams = new URLSearchParams({
      originLocationCode: origin,
      destinationLocationCode: destination,
      departureDate: depart_date,
      returnDate: return_date,
      travelClass: cabinClass,
      adults,
      children,
      infants,
      currencyCode: 'USD'
    });

    const flightResponse = await fetch(`https://test.api.amadeus.com/v2/shopping/flight-offers?${searchParams.toString()}`, {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    if (!flightResponse.ok) {
      return res.status(500).json({ error: 'Failed to fetch flight offers from Amadeus' });
    }

    const flightData = await flightResponse.json();
    res.json(flightData.data || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'An error occurred while fetching flight data' });
  }
});

app.listen(PORT, () => {
  console.log(`Amadeus backend running on port ${PORT}`);
});
