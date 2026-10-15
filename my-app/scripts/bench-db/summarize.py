#!/usr/bin/env python3
"""Summarise a bench-out directory produced by orchestrate.sh (REPEATS rounds).

usage: python3 summarize.py <bench-out-dir>

Reads results_old.csv and results_new.csv (columns: db,query,run,tps,avg_ms,p50_ms,p95_ms,p99_ms,n) and prints a Markdown
table with, for every query, the median over the rounds and the min-max range of p50, p95 and throughput for the old and
the new schema, plus the ratio of the medians. With one round the range is empty and the ratios are single-run values.
"""
import csv
import statistics
import sys
from collections import defaultdict
from pathlib import Path


def load(path):
    rows = defaultdict(list)
    with open(path, newline='') as f:
        for r in csv.reader(f):
            if len(r) < 9 or not r[3]:
                continue
            name = r[1].replace('_OLD', '').replace('_NEW', '')
            rows[name].append({'run': int(r[2]), 'tps': float(r[3]), 'p50': float(r[5]), 'p95': float(r[6]), 'n': int(r[8])})
    return rows


def agg(vals):
    return statistics.median(vals), min(vals), max(vals)


def fmt(x, digits=3):
    # plain numbers: thousands separators for big values, 3 significant digits for small ones
    return f'{x:,.0f}' if abs(x) >= 100 else f'{x:.{digits}g}'


def main(out):
    out = Path(out)
    old, new = load(out / 'results_old.csv'), load(out / 'results_new.csv')
    rounds = max((len(v) for v in list(old.values()) + list(new.values())), default=0)
    print(f'### Database benchmark summary ({rounds} round(s))\n')
    env = out / 'environment.txt'
    if env.exists():
        print('<details><summary>Environment</summary>\n\n```\n' + env.read_text().strip() + '\n```\n\n</details>\n')
    print('| Query | p50 ms before (median, range) | p50 ms after | p95 ms before | p95 ms after | throughput before | throughput after | p50 ratio | throughput ratio |')
    print('|---|---|---|---|---|---|---|---|---|')
    for q in sorted(set(old) | set(new)):
        o, n = old.get(q), new.get(q)
        if not o or not n:
            side = 'before' if o else 'after'
            r = (o or n)
            p50 = agg([x['p50'] for x in r])
            tps = agg([x['tps'] for x in r])
            print(f'| {q} (only on {side}) | {fmt(p50[0])} ({fmt(p50[1])}-{fmt(p50[2])}) | | | | {fmt(tps[0], 5)} | | | |')
            continue
        a = {k: agg([x[k] for x in o]) for k in ('p50', 'p95', 'tps')}
        b = {k: agg([x[k] for x in n]) for k in ('p50', 'p95', 'tps')}
        cell = lambda t, d=3: f'{fmt(t[0], d)} ({fmt(t[1], d)}-{fmt(t[2], d)})'
        print(f"| {q} | {cell(a['p50'])} | {cell(b['p50'])} | {cell(a['p95'])} | {cell(b['p95'])} | {cell(a['tps'], 5)} | {cell(b['tps'], 5)} | "
              f"{a['p50'][0] / b['p50'][0]:.2f}x | {b['tps'][0] / a['tps'][0]:.2f}x |")
    print('\nRatios are medians over the rounds. Ranges that overlap between before and after mean the difference is not distinguishable from run-to-run noise.')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
