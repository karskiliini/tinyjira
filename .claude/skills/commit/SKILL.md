---
name: commit
description: Create focused git commits, grouping only related changes together
user_invocable: true
---

Create a focused git commit by grouping only related changes together. If there are multiple unrelated changes, commit them separately. Ask the user about ambiguous files.

## Steps

1. Run `git status` (never use `-uall`) and `git diff` (both staged and unstaged) and `git log --oneline -5` in parallel to understand the current state and commit style.

2. Analyze ALL changes (staged, unstaged, and untracked) and group them by logical change:
   - Identify which files belong to the same logical change (e.g. a feature, a bug fix, a refactor)
   - If ALL changes are clearly part of one logical change, proceed to step 3
   - If there are multiple unrelated groups of changes, pick the first group and only commit those files
   - If a file could belong to multiple groups or its purpose is ambiguous, ask the user using AskUserQuestion before proceeding

3. Stage ONLY the files that belong to the current logical change (use specific file names, never `git add -A` or `git add .`).

4. Draft a concise commit message that:
   - Summarizes the "why" not the "what"
   - Follows the style of recent commits in the repo
   - Is 1-2 sentences max
   - Ends with `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`

5. Create the commit using a HEREDOC for the message.

6. After committing, run `git status` and `git diff` again to check for remaining uncommitted changes.

7. If there are remaining changes:
   - Analyze them the same way (group by logical change, identify ambiguous files)
   - Tell the user what remains and ask if they want to commit the next group
   - If yes, repeat from step 3
   - If no, stop

## Rules
- NEVER use `git add -A` or `git add .`
- NEVER commit files that likely contain secrets (.env, credentials, etc.) — warn the user instead
- NEVER skip hooks (--no-verify)
- NEVER amend existing commits
- Always use HEREDOC for commit messages
- Do not read or explore code beyond what git commands show — use the diff to understand changes
