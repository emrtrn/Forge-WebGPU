# Agent notes

Project rules, commands, ports and layer boundaries are in [CLAUDE.md](CLAUDE.md)
(Turkish). Read it first; it applies to every agent working in this repo.

For delegated tasks (Codex):

- Work only in the files named by the task. Do not commit or push; the diff is
  reviewed and committed by the delegating session.
- Run `npm run gate` before reporting a task as done and include its output.
- Do not add a dependency, a path alias or a layer rule unless the task says so.
- The Forge WebGL repo (`C:\Users\emret\Desktop\Forge`) is read-only reference.
