# Database benchmarks

This file records one benchmark run: the same query shapes on the **original** schema and on the schema produced by the
`20261015_*` cleanup migrations, on a real PostgreSQL 17 server with about one million certificates. Everything needed to
repeat it is in the repository (`scripts/bench-db/`), and the raw outputs of the reported run are in
`docs/benchmarks/`. The numbers below are copied from those files without rounding up.

It is a **database** benchmark. It does not include Supabase's API layer, the network, the Next.js server or real
traffic, so it says nothing about end-to-end HTTP latency.

## 1. Baseline definitions

| | "before" | "after" |
|---|---|---|
| Schema | `supabase/tests/live-schema.sql`: a reconstruction of the production schema from the owner's introspection of 2026-10-14. It matches the live database in table count (17) and index count (109); it is **not** a dump of the live database, and policies are only partly modelled. | the same database after `20261015_00` ... `08` and `03b`, applied in that order to a **copy** of the loaded "before" database (`CREATE DATABASE ... TEMPLATE`) |
| Application queries it is compared against | the code at commit `5d3bdce` (main after PR #11), before the cleanup | the code at commit `378e6c4` and later (cleanup merged in PR #26) |
| Data | identical rows in both (the second is a copy of the first) | |

Differences between the two variants that matter for the results:

- **Credential lookup:** before, `verifiable_credentials` is found by JSON containment on the signed credential (there is
  no index that supports it); after, by an indexed `certificate_id` column filled by a trigger and a backfill (step 01).
- **Indexes:** 109 before, 54 after (21 and 5 on `certificates`); the new composite indexes are defined in
  `20261015_03_indexes.sql`.
- **Inserts:** the "after" insert has a `BEFORE INSERT/UPDATE` trigger on `certificates` (`reviewed_at`, `updated_at`)
  that the "before" schema does not have, and omits the legacy `status` column that no longer exists.

## 2. Test configuration

| | |
|---|---|
| Server | PostgreSQL 17.11 (`postgres:17` image, Debian build), Docker Desktop on WSL2 |
| Server settings | `shared_buffers=1GB`, `effective_cache_size=3GB`, `work_mem=16MB`, `max_connections=100`, `--shm-size=1g`; everything else default (`fsync` and `synchronous_commit` on) |
| Container resources | 4 vCPU and 6.2 GB as reported by `docker info` earlier in the same session. Docker's engine was reset before the reported run and the value was **not** re-read, so treat it as the expected, not verified, value. |
| Host | Intel Core i5-13450HX (10 cores, 16 threads), 15.7 GB RAM, Windows 11 |
| Load generator | `pgbench` 17.11 inside the container, `-n -c 8 -j 4`, custom scripts, 5 s warm-up (not recorded) then 20 s measured per query |
| Percentiles | computed from `pgbench -l` per-transaction logs (all transactions of the 20 s run, `n` in the CSV) |
| Repetitions | **one run per query and schema.** No variance estimate exists; treat differences under about 15 percent as noise. |
| Cache state | warm: the data set (about 1.6 to 2.0 GB) fits in `shared_buffers` plus the OS cache, and each query had a warm-up |
| Data generator | `scripts/bench-db/seed.sql` (`setseed(0.42)`); counts below; loaded with triggers and foreign-key checks disabled (`session_replication_role = replica`) for speed, generated consistent |
| Data size | 1,000,006 certificates (5 percent pending, 20 percent rejected, 75 percent verified), 1,000,003 audit rows, 280,005 credentials (every 50th revoked), 102,007 users and profiles, 43 organizations |
| Parameter choice | each transaction picks a random organization (1 to 40), student (1 to 100,000) or sampled certificate (1 to 2,000) |

The recorded environment capture (Docker, image digest, server settings, git revision) was added to
`scripts/bench-db/orchestrate.sh` after the reported run; the reported run itself did not write it. The image digest seen
at the first pull of the session was `sha256:2d2b8998d31037bf721cfdf764d76ba74171b4fab3431b7f72c27c56ddbdf9e3`; the
image was pulled again after Docker was reset and that digest was not recorded.

## 3. What each query is, and how close it is to the application

| Benchmark query | File | Application code it is modelled on | Equivalence |
|---|---|---|---|
| Credential lookup by certificate | `q4_vc_lookup_OLD.sql` / `_NEW.sql` | `.contains('credential', { credentialSubject: { certificateId } })` in `certificateService.ts` at `5d3bdce`; after: `.eq('certificate_id', ...)` | **same predicate** (`credential @> {...}` plus `status = 'active'`) |
| A student's certificates | `q2_student_certs.sql` | `certificates/mine` | same columns and ordering; the benchmark omits the `organization_id IN (...)` filter the route adds |
| Role lookup | `q6_role_lookup.sql` | `getOrganizationContext` in `src/lib/api/utils/organization.ts` | same columns, filter and ordering |
| Audit log, latest rows of an organization | `q5_audit_org.sql` | `admin/dashboard` | same filter and ordering; the benchmark returns 50 rows, the route 10 |
| Top 50 pending certificates of an organization | `q1_review_queue.sql` | `certificates/pending` | **not the same**: the route has **no LIMIT** and uses `select *` (it returns every pending row of the organization, about 1,250 in this data set). The benchmark measures the paginated top-50 access pattern with fewer columns. |
| Insert a certificate | `q7_insert_OLD.sql` / `_NEW.sql` | `certificates/create` | the columns are a subset of what the route writes |
| Organization analytics | `q3_org_analytics.sql` | `analytics/dashboard` | **not an application query**: the route pages through rows (1,000 per page), it does not run this aggregate. It is a scan-bound reference query. |

A variant of the pending query that mirrors the route (no LIMIT, `select *`) is provided as
`scripts/bench-db/q/q1b_review_queue_unbounded.sql`. **It has not been run and no result for it is reported.**

## 4. Results (milliseconds, 8 concurrent clients, single run)

Raw: `docs/benchmarks/results-old.csv` and `results-new.csv` (columns: database, query, transactions per second,
average, p50, p95, p99, number of transactions).

| Query | p50 before | p50 after | p95 before | p95 after | throughput before | throughput after |
|---|---:|---:|---:|---:|---:|---:|
| Credential lookup by certificate | 433.8 | 0.102 | 1,012.8 | 0.185 | 15 / s | 70,420 / s |
| Insert a certificate | 5.29 | 1.06 | 11.30 | 1.55 | 1,323 / s | 6,967 / s |
| Top 50 pending certificates of an organization | 1.06 | 0.245 | 1.94 | 0.49 | 7,118 / s | 29,134 / s |
| A student's certificates | 0.237 | 0.146 | 0.453 | 0.248 | 31,500 / s | 51,168 / s |
| Role lookup | 0.132 | 0.115 | 0.215 | 0.196 | 57,033 / s | 64,472 / s |
| Audit log, latest 50 of an organization | 0.195 | 0.176 | 0.340 | 0.321 | 38,640 / s | 41,478 / s |
| Organization analytics (aggregate, about 25k rows) | 46.2 | 49.1 | 56.0 | 62.6 | 170 / s | 156 / s |

How to read them:

- **Credential lookup.** Before, every call was a parallel sequential scan of the 280,000 credential rows. Single,
  unloaded execution (`docs/benchmarks/explain-*.txt`): 103 ms and 35,007 buffers before; 0.035 ms and 4 buffers after.
  Under 8 concurrent clients the median went from 433.8 ms to 0.102 ms. The old figure includes contention between
  concurrent scans.
- **Insert.** Certificates carry 5 indexes after, 21 before (the benchmark inserts into a table that already has 1M
  rows). Both variants include the same lookup of the student and organization before the insert.
- **Top-50 pending.** Single execution: the old plan read 1,035 buffers and discarded 976 rows to return 50
  (`idx_certificates_org_created` plus a filter); the new composite index reads 53 buffers.
- **Role, audit and student queries** moved by 7 percent (audit), 13 percent (role) and 62 percent (student) in throughput; only the student query (62 percent
  throughput, 38 percent p50) is large enough to be unlikely to be noise, and even that is a single run. The role and audit
  results (about 10 to 13 percent) should not be quoted as improvements.
- **Organization analytics** did not improve (it is slightly slower, within noise). The cleanup did not target it.

## 5. Size and shape (`docs/benchmarks/stats-*.csv`)

| | before | after |
|---|---:|---:|
| Tables | 17 | 13 |
| Indexes | 109 | 54 |
| Indexes on `certificates` | 21 | 5 |
| `certificates` index size | 309 MB | 166 MB |
| `audit_logs` index size | 290 MB | 195 MB |
| `verifiable_credentials` index size | 23 MB | 57 MB (new lookup indexes) |
| Whole database | 1,587 MB | 1,997 MB |

The whole database is **larger** after the migration: new columns (some backfilled on every row) and table rewrites, and
the space of old row versions is not returned without a `VACUUM FULL`. Only the index footprint on `certificates` and
`audit_logs` shrank. (The counts exclude the benchmark's own helper tables, named `bench_*`.)

## 6. Migration at scale (`docs/benchmarks/migration-timings.txt`)

Applied to the loaded copy, one `psql -f` per step, wall-clock:

| Step | Time |
|---|---:|
| 00 preflight | 3.7 s |
| 01 expand (new columns, backfills across 1M rows) | 213.6 s |
| 02 integrity (constraints, triggers, type changes) | 22.7 s |
| 03 indexes | 5.7 s |
| 03b, 04, 05, 06, 07, 08 | under 0.7 s each |
| Whole chain | about 4 minutes |

All ten steps returned success on this data set. The other tables the steps touch (the recruiter tables and `role_requests`)
were empty or nearly empty here, so their cost is not represented.

## 7. Claims register

What may be said about this project's performance, and the file that supports it. Anything not listed here is not claimed.

| Claim | Evidence | Scope and limit |
|---|---|---|
| Credential lookup by certificate went from a median 433.8 ms to 0.102 ms (15 to 70,420 queries per second) at 280,005 credentials | `results-old.csv`, `results-new.csv` (`q4_*`), `explain-*.txt` | the old predicate is the one at commit `5d3bdce`; one run; database time only; 8 concurrent clients |
| Certificate inserts went from 1,323 to 6,967 per second at 1M rows | `results-*.csv` (`q7_*`) | one run; the new variant has an extra trigger and no legacy column |
| A top-50 pending-certificates query for an organization went from 7,118 to 29,134 per second (p95 1.94 to 0.49 ms) | `results-*.csv` (`q1_*`), `explain-*.txt` | **not** the production route, which has no limit; one run |
| Indexes on `certificates` went from 21 to 5, and total indexes from 109 to 54 | `stats-*.csv` | the "before" schema is a model that matches the live table and index counts |
| The ten migration steps ran on a 1M-row database in about 4 minutes without errors | `migration-timings.txt` | one machine, one run, mostly empty recruiter tables |
| Role, audit and analytics query performance is unchanged | `results-*.csv` | within single-run noise |

Not claimed: end-to-end API latency, behaviour under production traffic, results on real (skewed) data, results on other
hardware, or any figure for the unbounded pending query.

## 8. Reproduce

Needs Docker (6 to 8 GB of Docker disk at the peak; the run took about 20 minutes here):

```
bash my-app/scripts/bench-db/orchestrate.sh     # results land in ./bench-out
docker rm -f -v cs-bench                         # clean up
```

`orchestrate.sh` starts a throwaway container, loads the data, benchmarks the "before" schema, clones the database,
applies the migrations (timed), benchmarks the "after" schema, and writes the CSV, plan and size files plus an
`environment.txt`.

## 9. Other measured numbers (in-process, no database)

`node scripts/bench-verify.mjs`, `bench-merkle.mjs` and `bench-sdjwt.mjs` print their own results (single thread, warm,
one machine): offline credential verification (Ed25519) about 6,000 per second with p50 0.146 ms; a Merkle inclusion proof
over 100,000 entries p50 3.8 microseconds (against 179 ms without the subtree cache); selective-disclosure issue and
verify p50 0.41 ms and 0.24 ms. The transparency log and selective disclosure are optional and off in the hosted
deployment, and the production signing algorithm is RS256, which these benchmarks do not cover.
