const test = require('node:test');
const assert = require('node:assert');
const app = require('./server');

test('Server API Tests', async (t) => {
  let server;
  let port;

  t.before(async () => {
    return new Promise((resolve) => {
      // Start server on dynamic port (0)
      server = app.listen(0, () => {
        port = server.address().port;
        resolve();
      });
    });
  });

  t.after(() => {
    if (server) {
      server.close();
    }
  });

  await t.test('POST /correct should return 400 when missing mandatory parameters', async () => {
    const response = await fetch(`http://localhost:${port}/correct`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      // Sending empty body to simulate missing all parameters
      body: JSON.stringify({})
    });

    assert.strictEqual(response.status, 400, 'Expected status 400 Bad Request');
    const data = await response.json();
    assert.strictEqual(data.error, 'Missing mandatory parameters: apiKey, indexed, cmd are required.');
  });

  await t.test('POST /correct should return 400 when missing some mandatory parameters', async () => {
    const response = await fetch(`http://localhost:${port}/correct`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      // Missing apiKey
      body: JSON.stringify({
        indexed: '[0:我]',
        cmd: 'delete'
      })
    });

    assert.strictEqual(response.status, 400, 'Expected status 400 Bad Request');
    const data = await response.json();
    assert.strictEqual(data.error, 'Missing mandatory parameters: apiKey, indexed, cmd are required.');
  });
});
