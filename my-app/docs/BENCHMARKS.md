# Database benchmarks

This file records two benchmark runs of the same query shapes on the **original** schema and on the schema produced by
the `20261015_*` cleanup migrations, on a real PostgreSQL 17 server with about one million certificates:

- **Run 2 (reference): GitHub Actions, 3 rounds**, with median and range per query. Use these numbers.
- **Run 1 (historical): a single run on the maintainer's laptop.** Kept for the record. One of its results (the insert
  speed-up) was **not reproduced** by run 2 and is withdrawn; see section 5.

Everything needed to repeat it is in the repository (`scripts/bench-db/`, `.github/workflows/benchmark-db.yml`), and the
raw outputs of both runs are in `docs/benchmarks/`.

It is a **database** benchmark. It does not include Supabase's API layer, the network, the Next.js server or real
traffic, so it says nothing about end-to-end HTTP latency.

## 1. Baseline definitions

| | "before" | "after" |
|---|---|---|
| Schema | `supabase/tests/live-schema.sql`: a reconstruction of the production schema from the owner's introspection of 2026-10-14. It matches the live database in table count (17) and index count (109); it is **not** a dump of the live database, and policies are only partly modelled. | the same database after `20261015_00` ... `08` and `03b`, applied in that order to a **copy** of the loaded "before" database (`CREATE DATABASE ... TEMPLATE`) |
| Application queries it is compared against | the code at commit `5d3bdce` (main after PR #11), before the cleanup | the code after the cleanup (PR #26) |
| Data | identical rows in both (the second is a copy of the first) | |

Differences between the two variants that matter for the results:

- **Credential lookup:** before, `verifiable_credentials` is found by JSON containment on the signed credential (there is
  no index that supports it); after, by an indexed `certificate_id` column filled by a trigger and a backfill (step 01).
- **Indexes:** 109 before, 54 after (21 and 5 on `certificates`); the new composite indexes are defined in
  `20261015_03_indexes.sql`.
- **Rows are wider after:** the migration adds columns to `certificates` (for example `verification_details`,
  `storage_path`, `reviewed_at`), which matters for `select *` queries.
- **Inserts:** the "after" insert has a `BEFORE INSERT/UPDATE` trigger on `certificates` (`reviewed_at`, `updated_at`)
  that the "before" schema does not have (the old model has no trigger on that table), and omits the legacy `status`
  column that no longer exists.

## 2. Test configuration

| | Run 2 (reference) | Run 1 (historical) |
|---|---|---|
| Where | GitHub-hosted runner, workflow `benchmark-db.yml`, run `38721869813`, repository revision `a704d22` | maintainer's laptop, Docker Desktop (WSL2) |
| CPU / memory seen by the database | Intel Xeon Platinum 8573C, 4 vCPU, 16.8 GB (`docker info`) | Intel Core i5-13450HX host, 4 vCPU and about 6.2 GB for the container (value read earlier in the session, not re-read for the run) |
| Server | PostgreSQL 17.11, image digest `sha256:2d2b8998d31037bf721cfdf764d76ba74171b4fab3431b7f72c27c56ddbdf9e3` (recorded in `environment.txt`) | PostgreSQL 17.11, same digest at the first pull; the digest of the pull used for the final run was not recorded |
| Server settings | `shared_buffers=1GB`, `effective_cache_size=3GB`, `work_mem=16MB`, `max_connections=100`; defaults otherwise (`fsync` and `synchronous_commit` on) | same |
| Load generator | `pgbench` 17.11 in the container, `-n -c 8 -j 4`, custom scripts | same |
| Per query | 5 s warm-up (not recorded), then 20 s measured (the insert test: a fixed 8 x 3,000 = 24,000 inserts, rows deleted and `VACUUM ANALYZE` after each) | 5 s warm-up then 20 s measured, including the insert test (time-based, rows kept) |
| Repetitions | **3 rounds, interleaved** (each round runs every query on the old schema, then on the new one); median and min-max reported | one run |
| Percentiles | from `pgbench -l` per-transaction logs (all transactions of the measured run) | same |
| Cache state | warm (the data set fits in `shared_buffers` plus the OS cache) | same |
| Data | `scripts/bench-db/seed.sql` (`setseed(0.42)`): 1,000,006 certificates (5 percent pending, 20 percent rejected, 75 percent verified), 1,000,003 audit rows, 280,005 credentials (every 50th revoked), 102,007 users and profiles, 43 organizations; loaded with triggers and foreign-key checks disabled for speed | same |
| Parameters | each transaction picks a random organization (1 to 40), student (1 to 100,000) or sampled certificate (1 to 2,000) | same |

The two runs used different hardware, so absolute numbers differ (the runner is slower per query than the laptop). Only
the **ratios between before and after** are comparable across runs.

## 3. What each query is, and how close it is to the application

| Benchmark query | File | Application code it is modelled on | Equivalence |
|---|---|---|---|
| Credential lookup by certificate | `q4_vc_lookup_OLD.sql` / `_NEW.sql` | `.contains('credential', { credentialSubject: { certificateId } })` in `certificateService.ts` at `5d3bdce`; after: `.eq('certificate_id', ...)` | **same predicate** (`credential @> {...}` plus `status = 'active'`) |
| A student's certificates | `q2_student_certs.sql` | `certificates/mine` | same columns and ordering; the benchmark omits the `organization_id IN (...)` filter the route adds |
| Role lookup | `q6_role_lookup.sql` | `getOrganizationContext` in `src/lib/api/utils/organization.ts` | same columns, filter and ordering |
| Audit log, latest rows of an organization | `q5_audit_org.sql` | `admin/dashboard` | same filter and ordering; the benchmark returns 50 rows, the route 10 |
| Top 50 pending certificates of an organization | `q1_review_queue.sql` | `certificates/pending` | **not the same**: the route has **no LIMIT** and uses `select *`. This measures a paginated top-50 access pattern with fewer columns. |
| All pending certificates of an organization, `select *` | `q1b_review_queue_unbounded.sql` | `certificates/pending` | **mirrors the route** (no LIMIT, every column; about 1,250 rows per call in this data set) |
| Insert a certificate | `q7_insert_OLD.sql` / `_NEW.sql` | `certificates/create` | the columns are a subset of what the route writes |
| Organization analytics | `q3_org_analytics.sql` | `analytics/dashboard` | **not an application query**: the route pages through rows (1,000 per page); this aggregate is a scan-bound reference query |

## 4. Results, run 2 (reference): median of 3 rounds, with min-max

Raw: `docs/benchmarks/run2-github-actions/` (`results_old.csv`, `results_new.csv`, `summary.md`, `environment.txt`,
`explain_*.txt`, `stats_*.csv`, `migration_timings.txt`). Milliseconds; 8 concurrent clients.

| Query | p50 before | p50 after | p95 before | p95 after | throughput before | throughput after | ratio (p50 / throughput) |
|---|---|---|---|---|---|---|---|
| Credential lookup by certificate | 1,172 (883-1,188) | **0.207** (0.206-0.208) | 2,499 (2,472-2,544) | 0.231 (0.226-0.273) | 6.0 / s | **37,280 / s** (36,783-37,367) | 5,662x / 6,209x |
| Top 50 pending, one organization | 1.85 (1.82-1.90) | **0.476** (0.464-0.479) | 2.69 (2.55-2.99) | 0.841 (0.792-0.843) | 4,227 / s (4,171-4,325) | **16,286 / s** (16,050-16,403) | 3.89x / 3.85x |
| A student's certificates | 0.398 (0.380-0.415) | 0.272 (0.270-0.272) | 0.543 | 0.345 | 19,769 / s (18,651-20,671) | 28,574 / s (28,489-28,785) | 1.46x / 1.45x |
| Audit log, latest 50 of an organization | 0.406 (0.400-0.411) | 0.356 (0.354-0.359) | 0.669 | 0.548 | 18,944 / s (18,801-19,407) | 21,711 / s (21,482-21,781) | 1.14x / 1.15x |
| Role lookup | 0.259 (0.258-0.261) | 0.220 (0.216-0.228) | 0.340 | 0.337 | 29,700 / s (29,495-29,814) | 33,809 / s (33,706-35,666) | 1.18x / 1.14x |
| Insert a certificate (24,000 per round) | 1.18 (1.17-1.18) | 1.04 (1.03-1.04) | 1.73 | 1.53 | 6,270 / s (6,236-6,532) | 6,655 / s (6,621-7,463) | 1.14x / 1.06x |
| **All pending, `select *` (mirrors the route)** | 9.90 (9.70-10.40) | **10.90** (10.60-10.90) | 11.4 | 12.1 | 803 / s (763-821) | **733 / s** (731-748) | **0.91x / 0.91x** |
| Organization analytics (aggregate) | 81.7 (80.1-84.9) | 84.5 (83.9-84.5) | 87.4 | 89.5 | 97.5 / s | 94.4 / s | 0.97x / 0.97x |

How to read them:

- **Credential lookup** is the one large, unambiguous win. Before, every call was a parallel sequential scan of the 280,000
  credential rows (single execution: 103 ms and 35,007 buffers in run 1's plan). After, it is an index lookup (0.035 ms,
  4 buffers). The same order of magnitude appeared in both runs (about 4,250x in run 1, about 5,660x in run 2).
- **Top 50 pending** improved about 3.9x in both runs, because the new composite
  `(organization_id, verification_status, created_at)` index reads 53 buffers where the old index read 1,035 and discarded
  976 rows (run 1 plan).
- **The production route does not benefit.** The route (`certificates/pending`) has no LIMIT and uses `select *`. The query
  that mirrors it is about **9 percent slower** after the cleanup (non-overlapping ranges), most likely because the rows
  are wider (new columns). The 3.9x applies only to a paginated version of that queue, which the route does not do today.
- **Student, audit and role queries** improved by about 14 to 46 percent in throughput, small but consistent across the
  rounds (the ranges do not overlap). They are not headline numbers.
- **Insert** improved by only about 6 percent in throughput (14 percent at the median latency) once the test controls
  for table growth; this is **not** the 5x of run 1.
- **Organization analytics** is unchanged (within noise).

## 5. Results, run 1 (historical, local, single run)

Raw: `docs/benchmarks/results-old.csv`, `results-new.csv`. The ratios of the credential lookup (4,250x), the top-50
query (4.1x) and the student query (1.62x) were reproduced by run 2. **The insert figure was not**:

| Query | before | after | run 2 for comparison |
|---|---:|---:|---|
| Insert a certificate | 1,323 / s (p50 5.29 ms) | 6,967 / s (p50 1.06 ms), ratio 5.3x | 6,270 / s before, 6,655 / s after, ratio 1.06x |

**The 5.3x insert claim from run 1 is withdrawn.** The likely cause (not verified) is that run 1 measured the old schema
right after the bulk load, while background maintenance on the freshly loaded tables was still running, and the test grew
the tables for the duration of the run (the faster schema adds more rows in a fixed time). Run 2's harness uses a fixed
number of inserts, deletes them afterwards and runs `VACUUM ANALYZE` between rounds, so its insert numbers are the ones to use.

## 6. Size and shape (`stats_*.csv`, identical in both runs)

| | before | after |
|---|---:|---:|
| Tables | 17 | 13 |
| Indexes | 109 | 54 |
| Indexes on `certificates` | 21 | 5 |
| `certificates` index size | 309 MB | 166 MB |
| `audit_logs` index size | 290 MB | 195 MB |
| `verifiable_credentials` index size | 23 MB | 57 MB (new lookup indexes) |
| Whole database | 1,587-1,588 MB | 1,997-1,998 MB |

The whole database is **larger** after the migration: new columns (some backfilled on every row) and table rewrites, and
the space of old row versions is not returned without a `VACUUM FULL`. Only the index footprint on `certificates` and
`audit_logs` shrank. (The counts exclude the benchmark's own helper tables, named `bench_*`.)

## 7. Migration at scale

Applied to the loaded copy, one `psql -f` per step, wall-clock (`migration_timings.txt` in each run's folder):

| Step | Run 1 (laptop) | Run 2 (GitHub runner) |
|---|---:|---:|
| 00 preflight | 3.7 s | 6.0 s |
| 01 expand (new columns, backfills across 1M rows) | 213.6 s | 276.8 s |
| 02 integrity (constraints, triggers, type changes) | 22.7 s | 29.8 s |
| 03 indexes | 5.7 s | 11.1 s |
| 03b, 04, 05, 06, 07, 08 | under 0.7 s each | under 0.4 s each |
| Whole chain | about 4.0 minutes | about 5.4 minutes |

All ten steps returned success in both runs. The recruiter tables and `role_requests` were empty or nearly empty, so their
cost is not represented. Step 01 is the only long one; it is additive.

## 8. Claims register

What may be said about this project's performance, and the evidence. Anything not listed here is not claimed.

| Claim | Evidence | Scope and limit |
|---|---|---|
| Credential lookup by certificate is more than 4,000 times faster at the median at about 280,000 credentials (run 2: 1,172 ms to 0.207 ms; run 1: 434 ms to 0.102 ms), and throughput went from 6 to 37,280 per second (run 2) | run 2 `results_*.csv` (`q4_*`) and run 1; `explain-*.txt` | the old predicate is the one at commit `5d3bdce`; database time only; 8 concurrent clients; two different machines agree |
| A paginated top-50 pending query for an organization is about 3.9 times faster (run 2: 4,227 to 16,286 per second, p95 2.7 to 0.84 ms) | run 2 `results_*.csv` (`q1_*`) | **not** the production route; the route (no LIMIT, `select *`) is about 9 percent slower after the cleanup |
| Indexes on `certificates` went from 21 to 5, and total indexes from 109 to 54; their size on `certificates` from 309 MB to 166 MB | `stats-*.csv` | the "before" schema is a model that matches the live table and index counts |
| The ten migration steps ran on a 1M-row database in about 4 to 5.4 minutes without errors | `migration-timings.txt`, both runs | mostly empty recruiter tables; two machines |
| A student's certificate list, audit reads and role lookups are about 14 to 46 percent faster | run 2 | small and consistent; not headline numbers |
| Insert throughput is essentially unchanged (about 6 percent, run 2) | run 2 | the 5.3x from run 1 is withdrawn (section 5) |
| Organization analytics is unchanged | run 2 | |

Not claimed: end-to-end API latency, behaviour under production traffic, results on real (skewed) data, results on
hardware other than the two above, any improvement for the production pending-certificates route, or any insert speed-up.

## 9. Reproduce

On GitHub (no local resources needed): Actions tab, "Database benchmark (manual)", "Run workflow", `repeats` = 3. The run
uploads the CSVs, plans, sizes, `environment.txt` and a `summary.md` (median and range per query) as an artifact and in
the job summary. About 30 minutes.

Locally (needs Docker, 6 to 8 GB of Docker disk and enough free memory for a 1 GB database cache plus the page cache; a
1M-row run exhausted memory on a 15.7 GB laptop with other applications open):

```
REPEATS=3 bash my-app/scripts/bench-db/orchestrate.sh     # results land in ./bench-out
python3 my-app/scripts/bench-db/summarize.py bench-out     # median and range per query
docker rm -f -v cs-bench                                    # clean up
```

`run.sh` is the runner that produced run 1; `run-repeats.sh` is the runner used by `orchestrate.sh` and by run 2.

## 10. Other measured numbers (in-process, no database)

`node scripts/bench-verify.mjs`, `bench-merkle.mjs` and `bench-sdjwt.mjs` print their own results (single thread, warm,
one machine, one run each): offline credential verification (Ed25519) about 6,000 per second with p50 0.146 ms; a Merkle
inclusion proof over 100,000 entries p50 3.8 microseconds (against 179 ms without the subtree cache); selective-disclosure
issue and verify p50 0.41 ms and 0.24 ms. The transparency log and selective disclosure are optional and off in the
hosted deployment, and the production signing algorithm is RS256, which these benchmarks do not cover.
