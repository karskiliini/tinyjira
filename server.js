const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const TASKS_FILE = path.join(__dirname, 'tasks.json');
const INDEX_FILE = path.join(__dirname, 'index.html');
const REPLAN_FILE = path.join(__dirname, 'replan.js');

function defaultState() {
  return { nextId: 1, projectKey: 'SB', issues: [] };
}

function readTasks() {
  try {
    const data = fs.readFileSync(TASKS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    const state = defaultState();
    fs.writeFileSync(TASKS_FILE, JSON.stringify(state, null, 2));
    return state;
  }
}

function writeTasks(state) {
  fs.writeFileSync(TASKS_FILE, JSON.stringify(state, null, 2));
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    fs.readFile(INDEX_FILE, (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Error reading index.html');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
    return;
  }

  if (req.method === 'GET' && req.url === '/replan.js') {
    fs.readFile(REPLAN_FILE, (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Error reading replan.js');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      res.end(data);
    });
    return;
  }

  if (req.method === 'GET' && req.url === '/api/tasks') {
    const state = readTasks();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(state));
    return;
  }

  if (req.method === 'PUT' && req.url === '/api/tasks') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const state = JSON.parse(body);
        writeTasks(state);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`Sprint Board server running at http://localhost:${PORT}`);
});
