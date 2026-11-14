/**
 * Ask the OS for a free localhost port, so parallel sessions' playtest scripts never collide.
 * SMOKE_PORT still wins when set.
 */
import { createServer } from 'node:net';

export async function freePort() {
  if (process.env.SMOKE_PORT) return Number(process.env.SMOKE_PORT);
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}
