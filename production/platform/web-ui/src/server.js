const path = require('path');
const express = require('express');
const morgan = require('morgan');

const app = express();
const PORT = Number(process.env.PORT || 8088);
const GATEWAY_PUBLIC_URL = process.env.GATEWAY_PUBLIC_URL || 'http://localhost:8081';
const VERCEL_CONTROL_PLANE_URL = process.env.VERCEL_CONTROL_PLANE_URL || 'https://litecdnn.vercel.app';

app.use(morgan('tiny'));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

app.get('/config.json', (_req, res) => {
  res.json({
    gatewayUrl: GATEWAY_PUBLIC_URL,
    vercelControlPlaneUrl: VERCEL_CONTROL_PLANE_URL
  });
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[web-ui] running on :${PORT}`);
});
