# Context Band

How full the context window is, as a one-line bar above the prompt, so you know when to /compact or /clear.

```
Context ▰▰▰▰▰▰▰▰▱▱ 82% · 137k/167k · time to /compact
```

- Updates after every reply from the figures the status line reads; no /context needed.
- The share counts toward where auto-compaction runs, so 100% is the point Claude Code compacts on its own. With auto-compaction off it counts against the whole window.
- Teal while calm, amber from 50% or 100k tokens, red from 75% or 150k tokens, whichever comes first. The token thresholds matter on large windows, where quality drops long before the share looks high. All four are options; a token threshold of 0 turns it off.
- One toast when a reply crosses into red: `/compact` to summarize, `/clear` to start fresh.
- Sits beside the usage torch when the terminal is wide, on its own line when it is narrow.
- `/ctx` prints the figures; `/ctx demo calm|warm|hot` previews a level, `/ctx demo off` ends it.

## Install

```sh
claude plugin marketplace add hicrandn/claude-mods
claude plugin install context-band@hicran-mods
```
