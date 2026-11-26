import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const prefix = '/daily-activity-tracker/';
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
const port = Number(process.env.TRACKER_PORT || 4220);
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
  if (!pathname.startsWith(prefix)) {
    res.writeHead(302, { Location: prefix }).end();
    return;
  }
  const file = resolve(root, decodeURIComponent(pathname.slice(prefix.length)) || 'index.html');
  const inApp = file.startsWith(resolve(root, 'app') + sep);
  if ((!inApp && file !== resolve(root, 'index.html')) || !types[extname(file)]) {
    res.writeHead(404).end();
    return;
  }
  try {
    const contents = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] + '; charset=utf-8' }).end(contents);
  } catch {
    res.writeHead(404).end();
  }
});
server.listen(port, '127.0.0.1', () => console.log('Tracker at http://127.0.0.1:' + port + prefix));
