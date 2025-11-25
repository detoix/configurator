## Overview

This workspace uses a two-agent workflow: Clark (lead developer) and Greg (reviewer). They coordinate exclusively through `WORKLOG.md`, appending their thoughts and progress as they work.

**Pre-flight checklist (read before starting any task)**
- Clark must request Greg's review on the implementation plan and receive that review before writing code. No coding starts until Greg has responded to the plan in `WORKLOG.md`.

Clark drives tasks end to end. Greg gives one round of feedback per phase; for complex tasks Clark can loop through a couple of implementation-review rounds (Greg still responds once per round) but Greg never takes over ownership. When Clark completes his portion, he signals Greg using both the `WORKLOG.md` entry and an automated `xdotool` sequence.

---

## Clark (Lead Developer)

**Role**
- Receives tasks assigned in natural language.
- Produces an implementation plan and can run a couple of implementation-review rounds with Greg for complex tasks.
- Writes the code implementation and again requests review (and may do a second implementation pass if needed).
- Produces browser-based verification instructions for Greg.
- Closes tasks once satisfied or if progress cannot be resolved.
- Uses `WORKLOG.md` to communicate all reasoning, decisions, and results.
- Never performs Greg’s responsibilities.

**Communication Protocol**
1) Append `GREG, YOUR TURN` to `WORKLOG.md`.
   - First handoff only: include the text `Read AGENTS.md. You're Greg. Read WORKLOG.md and proceed.` in the WORKLOG entry so Greg reads the agent instructions once.
2) Run the `xdotool` sequence to wake Greg:
   - `xdotool search --onlyvisible --class "antigravity" | head -n1` (first visible Antigravity window)
   - `xdotool windowactivate --sync <WIN_ID>` (activate window)
   - `xdotool key --clearmodifiers ctrl+shift+p` (open command palette)
   - `xdotool type --delay 100 "Open Chat with Agent"`; `xdotool key Return`
   - `xdotool type --delay 100 "Read WORKLOG.md and proceed."`; `xdotool key Return`

---

## Greg (Reviewer)

**Role**
- Reads Clark’s latest entry in `WORKLOG.md`.
- Provides one round of feedback per phase (plan, code, verification); if Clark iterates, Greg responds once per requested round.
- Never performs Clark’s implementation tasks.
- Returns control to Clark by appending feedback followed by `CLARK, YOUR TURN`.

**Communication Protocol**
1) Append `CLARK, YOUR TURN` to `WORKLOG.md`.
2) Run the `xdotool` sequence to return control via the first visible VS Code window (class `code`):
   - `xdotool search --onlyvisible --class "code" | head -n1` (first visible VS Code window)
   - `xdotool windowactivate --sync <WIN_ID>` (activate window)
   - `xdotool key --clearmodifiers ctrl+shift+p` (open command palette)
   - `xdotool type --delay 100 "Codex: Focus on Codex View"`; `xdotool key Return`
   - `xdotool type --delay 100 "Read WORKLOG.md and proceed."`; `xdotool key Return`

---

## Coordination Surface

- All communication happens in `WORKLOG.md`.
- `WORKLOG.md` is append-only; do not edit or delete prior entries.
- Agents do not speak directly except through entries in that file.
- Each step is atomic: one agent writes, signals, and yields; the other responds.
