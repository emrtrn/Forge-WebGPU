# Agent notes

Project rules, commands, ports and layer boundaries are in [CLAUDE.md](CLAUDE.md)
(Turkish). Read it first; it applies to every agent working in this repo.

For delegated tasks (Codex):

- Work only in the files named by the task. Do not commit or push; the diff is
  reviewed and committed by the delegating session.
- Follow CLAUDE.md's scope-based validation rules. Do not run the full gate
  merely to report a delegated task as done; report the focused checks used
  and any remaining validation limits. Run the full gate only when explicitly
  requested by the user or delegating session.
- Do not add a dependency, a path alias or a layer rule unless the task says so.
- The Forge WebGL repo (`C:\Users\emret\Desktop\Forge`) is read-only reference.
