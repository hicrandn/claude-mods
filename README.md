# hicran-mods

A Claude Code plugin marketplace of small mods.

<img width="500" height="200" alt="image" src="https://github.com/user-attachments/assets/f37fa3ec-fa05-4505-afab-b320a0d9da51" />


| Mod | What it does |
| --- | --- |
| [usage-torch](plugins/usage-torch) | Your Claude usage limit, as a tiny torchbearer whose flame fades as you use it. The band sits above the prompt. It reads your rate-limit windows after every reply and shows the one closest to its limit: the 5-hour window or the weekly one. |

## Install

```sh
claude plugin marketplace add hicrandn/claude-mods
claude plugin install usage-torch@hicran-mods
```

## Try it
The torchbearer shows up right away. Send any message: after the first reply, the waiting line turns into your real usage.

Mods need Claude Code 2.1.287 or newer.

## License

MIT
