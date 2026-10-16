# hicran-mods

A Claude Code plugin marketplace of small mods.

| Mod | What it does |
| --- | --- |
| [usage-torch](plugins/usage-torch) | Your Claude usage limit, as a one-line torch bar that fades as you use it. The band sits above the prompt. It reads your rate-limit windows after every reply and shows what is left of the 5-hour and the weekly window side by side (5h 72% · week 58%). The bar follows the one closest to its limit. |
| [context-band](plugins/context-band) | How full the context window is, as a one-line bar next to the torch (Context ▰▰▰▱▱▱▱▱▱▱ 31% · 52k/167k). It updates after every reply, so you see the fill without running /context. The share counts toward where auto-compaction runs. It turns amber at 50% or 100k tokens and red at 75% or 150k tokens, where it says it is time to /compact, and raises one toast when it crosses that line. /ctx prints the figures. |

## Install

```sh
claude plugin marketplace add hicrandn/claude-mods
claude plugin install usage-torch@hicran-mods
claude plugin install context-band@hicran-mods
```

## Try it
The torch band shows up right away. Send any message: after the first reply, the waiting line turns into your real usage.

Mods need Claude Code 2.1.287 or newer.

## License

MIT
