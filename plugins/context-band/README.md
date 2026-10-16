# Context Band

How full the context window is, as a one-line bar above the prompt, so you know when to /compact or /clear.

```
Context ▰▰▰▰▰▰▰▰▱▱ 82% · 164k/200k · time to /compact
```

- Updates after every reply from the figures the status line reads; no /context needed.
- Teal while calm, amber from 50% used, red from 75% used. Both thresholds are options.
- One toast when a reply crosses into red: `/compact` to summarize, `/clear` to start fresh.
- Sits beside the usage torch when the terminal is wide, on its own line when it is narrow.
- `/ctx` prints the figures; `/ctx demo calm|warm|hot` previews a level, `/ctx demo off` ends it.

The percentage is the last reply's input tokens against the model's full window, as the status line counts it. /context measures against the compaction window, which can be smaller, so its percentage can read a little higher.
