import {createServer} from 'node:http';

const scenario = process.argv[2] ?? 'normal';
if (!['normal', 'challenge', 'empty'].includes(scenario)) {
  throw new Error('Usage: node ecom/experiments/login-form-fixture.mjs [normal|challenge|empty]');
}

let submissions = 0;
const server = createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/login') {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(`<!doctype html><title>Ecom login fixture</title>
<form data-ecom-login-fixture method="post" action="/submit">
<label>Username <input name="username" value="${scenario === 'empty' ? '' : 'fixture-user'}"></label>
<label>Password <input name="password" type="password" value="fixture-password"></label>
<button type="submit">登录</button>
</form>
${scenario === 'challenge' ? '<p data-login-challenge>需要人工验证</p>' : ''}`);
  } else if (request.method === 'POST' && request.url === '/submit') {
    let body = '';
    for await (const chunk of request) {
      body += chunk;
      if (body.length > 1024) {
        response.writeHead(413).end();
        return;
      }
    }
    const fields = new URLSearchParams(body);
    const matched = fields.get('username') === 'fixture-user' &&
      fields.get('password') === 'fixture-password';
    console.log(JSON.stringify({submissions: ++submissions, matched}));
    response.writeHead(matched ? 200 : 400).end(matched ? 'Fixture submitted' : 'Fixture rejected');
  } else {
    response.writeHead(404).end();
  }
});

server.listen(59997, '127.0.0.1', () => console.log('http://127.0.0.1:59997/login'));
