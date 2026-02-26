---
name: push
description: Push the main branch to remote
user_invocable: true
---

Push the main branch to the remote repository.

## Steps

1. Run `git status` to confirm you are on the main branch and check if there are commits to push.
2. If not on main, tell the user and stop.
3. If there are no commits ahead of remote, tell the user there is nothing to push.
4. Run `git push origin main`.
5. Report the result.
