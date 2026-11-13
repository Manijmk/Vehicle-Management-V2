const net = require('node:net');
const { spawn } = require('node:child_process');

function createPortBridge(localPort, targetPort) {
  const server = net.createServer((socket) => {
    socket.setNoDelay(true);
    const child = spawn('wsl', ['-d', 'Ubuntu', 'nc', '127.0.0.1', String(targetPort)]);

    socket.pipe(child.stdin);
    child.stdout.pipe(socket);

    socket.on('error', () => {
      try {
        child.kill();
      } catch {}
    });
    child.on('error', () => {
      try {
        socket.destroy();
      } catch {}
    });
    child.on('close', () => {
      try {
        socket.end();
      } catch {}
    });
  });

  server.listen(localPort, '127.0.0.1', () => {
    console.log(`Bridge active: 127.0.0.1:${localPort} -> WSL 127.0.0.1:${targetPort}`);
  });

  server.on('error', (err) => {
    console.error(`Bridge on port ${localPort} error:`, err.message);
  });

  return server;
}

createPortBridge(5432, 5432);
createPortBridge(6379, 6379);
createPortBridge(9000, 9000);
createPortBridge(9001, 9001);

setInterval(() => {}, 60000);
console.log('Persistent dev bridge initialized');
