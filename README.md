# csv-reader-speed-01-run-20261121-entry

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/gemarizkyu/csv-reader-speed-01-run-20261121-entry/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/gemarizkyu/csv-reader-speed-01-run-20261121-entry/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's own csv-reader 1.0.0 that answers exactly as it does on every case, including every broken row: stray CRs, unterminated quotes, quote junk, short and long rows. Places go by CPU time, least first.

How it is faster: one left-to-right pass that jumps between delimiters with native `indexOf` and slices fields out whole, instead of reading one character at a time. Quoted fields are found with `indexOf('"')`; line breaks and doubled quotes inside them are handled only when present. CR scans are cached so all of them together cost O(n).

Local check on the kit's practice set (6 cases, ~10.2 MB of CSV): all 6 cases byte-identical to csv-reader 1.0.0, median ~182 ms per full set against the house baseline's ~435 ms on this machine (local numbers, not the server heat).

## Run it

```sh
MAKEFUN_INPUT_DIR=./input MAKEFUN_OUTPUT_DIR=./output node main.ts
```

`main.ts` reads every case from `$MAKEFUN_INPUT_DIR/cases.json`, answers each with `run()` from `solve.js`, and writes `$MAKEFUN_OUTPUT_DIR/answers.json`. Requires Node 22 or later. No dependencies.

---

<sub>Entered on [make.fun](https://make.fun/?ref=yyra59b6&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
