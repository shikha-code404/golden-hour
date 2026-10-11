'use strict';

require('dotenv').config();

const port = Number(process.env.PORT) || 3000;
const url = `http://localhost:${port}/api/tick?force=1`;

fetch(url, {
  method: 'POST',
  headers: { 'x-tick-secret': process.env.TICK_SECRET || '' },
})
  .then(async (response) => {
    const body = await response.text();
    console.log(`[force-tick] ${response.status} ${body}`);
    if (!response.ok) process.exitCode = 1;
  })
  .catch((error) => {
    console.error(`[force-tick] ${error.message}`);
    process.exitCode = 1;
  });
