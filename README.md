# hicran-mods

A Claude Code plugin marketplace of small mods.

| Mod | What it does |
| --- | --- |
| [usage-torch](plugins/usage-torch) | Your Claude usage limit, as a one-line torch bar that fades as you use it. The band sits above the prompt. It reads your rate-limit windows after every reply and shows what is left of the 5-hour and the weekly window side by side (5h 72% · week 58%). The bar follows the one closest to its limit. |

## Install

```sh
claude plugin marketplace add hicrandn/claude-mods
claude plugin install usage-torch@hicran-mods
```

## Try it
The torch band shows up right away. Send any message: after the first reply, the waiting line turns into your real usage.

Mods need Claude Code 2.1.287 or newer.

## License

MIT
