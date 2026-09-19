import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import WebSocket from 'ws';
import { attachLiveCallSocket } from './live-call';

test('generated client speech enters the conversation once from its known text', async () => {
  const server = createServer();
  attachLiveCallSocket(server, { DEEPGRAM_API_KEY: 'test' });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}/api/live-call/socket`, { origin });
  try {
    await once(socket, 'open');
    const turns: { role: string; text: string }[] = [];
    const secondTurn = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('The second client turn did not arrive.')), 2000);
      socket.on('message', raw => {
        const event = JSON.parse(raw.toString());
        if (event.type !== 'turn') return;
        turns.push(event);
        if (turns.length === 2) { clearTimeout(timer); resolve(); }
      });
    });
    socket.send(JSON.stringify({ type: 'start', facts: [{ id: 'cash', title: 'Cash', text: 'Known balance', source: 'Case' }] }));
    socket.send(JSON.stringify({ type: 'client-playback', status: 'start', text: 'Could you explain my portfolio?', voice: 'default' }));
    socket.send(JSON.stringify({ type: 'client-playback', status: 'start', text: 'Could you explain my portfolio?', voice: 'default' }));
    socket.send(JSON.stringify({ type: 'client-playback', status: 'end' }));
    socket.send(JSON.stringify({ type: 'client-playback', status: 'start', text: 'What should I check next?', voice: 'default' }));
    await secondTurn;
    assert.deepEqual(turns.map(turn => [turn.role, turn.text]), [
      ['client', 'Could you explain my portfolio?'],
      ['client', 'What should I check next?'],
    ]);
  } finally {
    socket.close();
    await once(socket, 'close');
    server.close();
    await once(server, 'close');
  }
});
