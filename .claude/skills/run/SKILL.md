---
name: run
description: Start the TinyJira server and provide a clickable link
user_invocable: true
---

Start the TinyJira server and give the user a clickable link.

## Steps

1. Run `node server.js` in the background using Bash with `run_in_background: true`
2. Immediately output the following message to the user (do NOT wait for the background task):

   Server starting... Open TinyJira: http://localhost:3000

3. That's it. Do not read files, do not explore the codebase, do not do anything else.
