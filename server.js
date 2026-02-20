const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const TASKS_FILE = path.join(__dirname, 'tasks.csv');
const INDEX_FILE = path.join(__dirname, 'index.html');
const REPLAN_FILE = path.join(__dirname, 'replan.js');
const CONFIG_FILE = path.join(__dirname, 'server.conf');

// --- Config (visible fields + order) ---

function readConfig() {
  try {
    const data = fs.readFileSync(CONFIG_FILE, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return { visibleFields: [] };
  }
}

function writeConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n');
}

// --- CSV Parser (RFC 4180 compliant) ---

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        field += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ',') {
        row.push(field);
        field = '';
        i++;
      } else if (ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) {
        row.push(field);
        field = '';
        rows.push(row);
        row = [];
        i += (ch === '\r') ? 2 : 1;
      } else {
        field += ch;
        i++;
      }
    }
  }
  // Last field/row
  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const headers = rows[0] || [];
  const dataRows = rows.slice(1).filter(r => r.length > 1 || r[0] !== '');
  return { headers, dataRows };
}

function serializeCSV(headers, dataRows) {
  function escapeField(val) {
    val = String(val == null ? '' : val);
    if (val.includes(',') || val.includes('"') || val.includes('\n') || val.includes('\r')) {
      return '"' + val.replace(/"/g, '""') + '"';
    }
    return val;
  }
  const lines = [headers.map(escapeField).join(',')];
  for (const row of dataRows) {
    // Pad row to match header length
    const padded = [];
    for (let i = 0; i < headers.length; i++) {
      padded.push(escapeField(i < row.length ? row[i] : ''));
    }
    lines.push(padded.join(','));
  }
  return lines.join('\n') + '\n';
}

// --- Column index helpers ---

function findColIndex(headers, name) {
  return headers.indexOf(name);
}

function getCell(row, idx) {
  if (idx < 0 || idx >= row.length) return '';
  return row[idx];
}

function setCell(row, idx, value) {
  if (idx < 0) return;
  while (row.length <= idx) row.push('');
  row[idx] = String(value == null ? '' : value);
}

// --- Status mapping ---

const STATUS_TO_INTERNAL = {
  'open': 'todo',
  'to do': 'todo',
  'backlog': 'todo',
  'in refinement': 'todo',
  'new': 'todo',
  'reopened': 'todo',
  'in progress': 'inprogress',
  'in development': 'inprogress',
  'in review': 'inprogress',
  'done': 'done',
  'closed': 'done',
  'resolved': 'done',
};

function mapStatusToInternal(csvStatus) {
  const key = (csvStatus || '').toLowerCase().trim();
  return STATUS_TO_INTERNAL[key] || 'todo';
}

const INTERNAL_TO_STATUS = {
  'todo': 'Open',
  'inprogress': 'In Progress',
  'done': 'Done',
};

function mapStatusToCSV(internalStatus) {
  return INTERNAL_TO_STATUS[internalStatus] || 'Open';
}

// --- Priority mapping ---

const PRIORITY_TO_INTERNAL = {
  'blocker': 'high',
  'critical': 'high',
  'highest': 'high',
  'high': 'high',
  'major': 'medium',
  'medium': 'medium',
  'normal': 'medium',
  'minor': 'low',
  'low': 'low',
  'trivial': 'low',
  'lowest': 'low',
};

function mapPriorityToInternal(csvPriority) {
  const key = (csvPriority || '').toLowerCase().trim();
  return PRIORITY_TO_INTERNAL[key] || 'medium';
}

const INTERNAL_TO_PRIORITY = {
  'high': 'Critical',
  'medium': 'Major',
  'low': 'Minor',
};

function mapPriorityToCSV(internalPriority) {
  return INTERNAL_TO_PRIORITY[internalPriority] || 'Major';
}

// --- In-memory CSV store (preserves all original columns) ---

let csvHeaders = [];
let csvDataRows = [];
let colIndices = {};

function buildColIndices(headers) {
  colIndices = {
    summary: findColIndex(headers, 'Summary'),
    issueKey: findColIndex(headers, 'Issue key'),
    issueId: findColIndex(headers, 'Issue id'),
    issueType: findColIndex(headers, 'Issue Type'),
    status: findColIndex(headers, 'Status'),
    priority: findColIndex(headers, 'Priority'),
    assignee: findColIndex(headers, 'Assignee'),
    description: findColIndex(headers, 'Description'),
    originalEstimate: findColIndex(headers, 'Original Estimate'),
    depends: findColIndex(headers, 'Inward issue link (Depends)'),
    finishToStart: findColIndex(headers, 'Inward issue link (Finish to Start)'),
    sprint: headers.indexOf('Sprint'),
  };
}

function parseDepsField(raw) {
  return raw.trim() ? raw.split(/\s*;\s*/).map(s => s.trim()).filter(Boolean) : [];
}

function csvRowToIssue(row) {
  const estimateSec = parseInt(getCell(row, colIndices.originalEstimate), 10);
  const estimateHours = isNaN(estimateSec) ? 0 : estimateSec / 3600;

  const issueId = parseInt(getCell(row, colIndices.issueId), 10);

  // Parse both inward issue link columns as dependencies (semicolon-separated issue IDs)
  const deps1 = parseDepsField(getCell(row, colIndices.depends));
  const deps2 = parseDepsField(getCell(row, colIndices.finishToStart));
  const dependsOn = [...new Set([...deps1, ...deps2])];

  return {
    id: issueId,
    key: getCell(row, colIndices.issueKey),
    title: getCell(row, colIndices.summary),
    description: getCell(row, colIndices.description),
    status: mapStatusToInternal(getCell(row, colIndices.status)),
    priority: mapPriorityToInternal(getCell(row, colIndices.priority)),
    assignee: getCell(row, colIndices.assignee),
    estimateHours: estimateHours,
    dependsOn: dependsOn,
    sprint: 1,
    rawRow: [...row],
  };
}

function issueToCSVRow(issue, existingRow) {
  const row = issue.rawRow ? [...issue.rawRow]
    : existingRow ? [...existingRow]
    : new Array(csvHeaders.length).fill('');
  setCell(row, colIndices.summary, issue.title);
  setCell(row, colIndices.issueKey, issue.key);
  setCell(row, colIndices.issueId, issue.id);
  setCell(row, colIndices.status, mapStatusToCSV(issue.status));
  setCell(row, colIndices.priority, mapPriorityToCSV(issue.priority));
  setCell(row, colIndices.assignee, issue.assignee || '');
  setCell(row, colIndices.description, issue.description || '');
  setCell(row, colIndices.originalEstimate, issue.estimateHours ? Math.round(issue.estimateHours * 3600) : '');
  const depsStr = Array.isArray(issue.dependsOn) ? issue.dependsOn.join('; ') : '';
  if (colIndices.depends >= 0) {
    setCell(row, colIndices.depends, depsStr);
  }
  if (colIndices.finishToStart >= 0) {
    setCell(row, colIndices.finishToStart, depsStr);
  }
  return row;
}

// --- Read / Write ---

function readTasks() {
  try {
    const data = fs.readFileSync(TASKS_FILE, 'utf8');
    const parsed = parseCSV(data);
    csvHeaders = parsed.headers;
    csvDataRows = parsed.dataRows;
    buildColIndices(csvHeaders);

    const issues = csvDataRows.map(csvRowToIssue).filter(i => !isNaN(i.id));
    const maxId = issues.reduce((m, i) => Math.max(m, i.id), 0);

    // Derive projectKey from first issue's key
    let projectKey = 'SB';
    if (issues.length > 0 && issues[0].key) {
      const dash = issues[0].key.lastIndexOf('-');
      if (dash > 0) projectKey = issues[0].key.substring(0, dash);
    }

    // Convert dependsOn from issue keys to issue ids
    const keyToId = {};
    issues.forEach(i => { keyToId[i.key] = i.id; });
    issues.forEach(i => {
      i.dependsOn = i.dependsOn
        .map(dep => keyToId[dep] || parseInt(dep, 10))
        .filter(d => !isNaN(d));
    });

    return {
      nextId: maxId + 1,
      projectKey: projectKey,
      sprintStart: '2026-02-15',
      teamCapacity: {},
      issues: issues,
      csvHeaders: csvHeaders,
    };
  } catch (e) {
    return { nextId: 1, projectKey: 'SB', sprintStart: '2026-02-15', teamCapacity: {}, issues: [] };
  }
}

function writeTasks(state) {
  // If no headers loaded yet, initialize with minimal headers
  if (csvHeaders.length === 0) {
    csvHeaders = ['Summary', 'Issue key', 'Issue id', 'Issue Type', 'Status', 'Project key',
      'Project name', 'Project type', 'Project lead', 'Project description', 'Project url',
      'Priority', 'Resolution', 'Assignee', 'Reporter', 'Creator', 'Created', 'Updated',
      'Last Viewed', 'Resolved', 'Affects Version/s', 'Fix Version/s', 'Component/s',
      'Due Date', 'Votes', 'Description',
      'Inward issue link (Depends)', 'Inward issue link (Finish to Start)'];
    buildColIndices(csvHeaders);
    csvDataRows = [];
  }

  // Build a map of existing CSV rows by Issue id
  const existingById = {};
  csvDataRows.forEach(row => {
    const id = parseInt(getCell(row, colIndices.issueId), 10);
    if (!isNaN(id)) existingById[id] = row;
  });

  // Keep dependsOn as issue IDs for CSV storage (semicolon-separated)
  const issuesForCSV = state.issues.map(i => ({
    ...i,
    dependsOn: (Array.isArray(i.dependsOn) ? i.dependsOn : [])
      .map(depId => String(depId)),
  }));

  // Update existing rows and collect new ones
  const updatedIds = new Set();
  const newRows = [];

  for (const issue of issuesForCSV) {
    updatedIds.add(issue.id);
    const existingRow = existingById[issue.id];
    newRows.push(issueToCSVRow(issue, existingRow));
  }

  // Keep order: existing rows that are still present (in original order), then new rows at end
  const orderedRows = [];
  const appendedIds = new Set();
  for (const row of csvDataRows) {
    const id = parseInt(getCell(row, colIndices.issueId), 10);
    if (updatedIds.has(id)) {
      // Find the updated version
      const issue = issuesForCSV.find(i => i.id === id);
      orderedRows.push(issueToCSVRow(issue, row));
      appendedIds.add(id);
    }
    // Deleted rows are simply skipped
  }
  // Append truly new issues (not in original CSV)
  for (const issue of issuesForCSV) {
    if (!appendedIds.has(issue.id)) {
      orderedRows.push(issueToCSVRow(issue, null));
    }
  }

  csvDataRows = orderedRows;
  fs.writeFileSync(TASKS_FILE, serializeCSV(csvHeaders, csvDataRows));
}

// --- HTTP Server ---

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

  if (req.method === 'GET' && req.url === '/api/config') {
    const config = readConfig();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(config));
    return;
  }

  if (req.method === 'PUT' && req.url === '/api/config') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const config = JSON.parse(body);
        writeConfig(config);
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
