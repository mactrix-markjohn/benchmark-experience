const localtunnel = require('localtunnel');
const fs = require('fs');

const port = 5173;

async function start() {
  try {
    console.log('Connecting to localtunnel...');
    const tunnel = await localtunnel({ port });
    console.log('TUNNEL_URL=' + tunnel.url);
    fs.writeFileSync('tunnel-url.txt', tunnel.url);
    
    tunnel.on('close', () => {
      console.log('Tunnel closed. Reconnecting in 5 seconds...');
      setTimeout(start, 5000);
    });
    
    tunnel.on('error', (err) => {
      console.error('Tunnel error:', err);
    });
  } catch (err) {
    console.error('Error starting tunnel, retrying in 5 seconds:', err);
    setTimeout(start, 5000);
  }
}

// Keep event loop alive indefinitely
setInterval(() => {}, 10000);

start();
