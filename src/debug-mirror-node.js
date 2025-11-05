const https = require('https');

const url =
  'https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.7193058/messages?sequencenumber=gt:18&limit=10&order=asc';

https
  .get(url, res => {
    let data = '';
    res.on('data', chunk => (data += chunk));
    res.on('end', () => {
      const response = JSON.parse(data);
      console.log(JSON.stringify(response, null, 2));
    });
  })
  .on('error', err => {
    console.error('Error:', err.message);
  });
