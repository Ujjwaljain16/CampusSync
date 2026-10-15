### Database benchmark summary (3 round(s))

<details><summary>Environment</summary>

```
date_utc=2026-10-15T10:40:21Z
repeats=3
git_revision=a704d22e498642a42486c18236627a827c86b099
git_uncommitted_files=1
Docker version 28.0.4, build b8034c0
docker_cpus=4 docker_mem_bytes=16765378560 docker_server=28.0.4 docker_os=Ubuntu 24.04.5 LTS
image_digest=postgres@sha256:2d2b8998d31037bf721cfdf764d76ba74171b4fab3431b7f72c27c56ddbdf9e3
postgres_version=PostgreSQL 17.11 (Debian 17.11-1.pgdg13+2) on x86_64-pc-linux-gnu, compiled by gcc (Debian 14.2.0-19) 14.2.0, 64-bit
shared_buffers=1GB
effective_cache_size=3GB
work_mem=16MB
max_connections=100
fsync=on
synchronous_commit=on
random_page_cost=4
pgbench (PostgreSQL) 17.11 (Debian 17.11-1.pgdg13+2)
host_cpu=INTEL(R) XEON(R) PLATINUM 8573C
host_nproc=4
```

</details>

| Query | p50 ms before (median, range) | p50 ms after | p95 ms before | p95 ms after | throughput before | throughput after | p50 ratio | throughput ratio |
|---|---|---|---|---|---|---|---|---|
| q1_review_queue | 1.85 (1.82-1.9) | 0.476 (0.464-0.479) | 2.69 (2.55-2.99) | 0.841 (0.792-0.843) | 4,227 (4,171-4,325) | 16,286 (16,050-16,403) | 3.89x | 3.85x |
| q1b_review_queue_unbounded | 9.9 (9.7-10.4) | 10.9 (10.6-10.9) | 11.4 (11.1-11.8) | 12.1 (11.8-12.1) | 803 (763-821) | 733 (731-748) | 0.91x | 0.91x |
| q2_student_certs | 0.398 (0.38-0.415) | 0.272 (0.27-0.272) | 0.543 (0.516-0.771) | 0.345 (0.338-0.355) | 19,769 (18,651-20,671) | 28,574 (28,489-28,785) | 1.46x | 1.45x |
| q3_org_analytics | 81.7 (80.1-84.9) | 84.5 (83.9-84.5) | 87.4 (83.9-92) | 89.5 (88.6-89.6) | 97.524 (93.681-99.611) | 94.398 (94.108-94.995) | 0.97x | 0.97x |
| q4_vc_lookup | 1,172 (883-1,188) | 0.207 (0.206-0.208) | 2,499 (2,472-2,544) | 0.231 (0.226-0.273) | 6.0039 (5.9842-6.0344) | 37,280 (36,783-37,367) | 5661.69x | 6209.30x |
| q5_audit_org | 0.406 (0.4-0.411) | 0.356 (0.354-0.359) | 0.669 (0.587-0.687) | 0.548 (0.508-0.554) | 18,944 (18,801-19,407) | 21,711 (21,482-21,781) | 1.14x | 1.15x |
| q6_role_lookup | 0.259 (0.258-0.261) | 0.22 (0.216-0.228) | 0.34 (0.338-0.346) | 0.337 (0.272-0.353) | 29,700 (29,495-29,814) | 33,809 (33,706-35,666) | 1.18x | 1.14x |
| q7_insert | 1.18 (1.17-1.18) | 1.04 (1.03-1.04) | 1.73 (1.67-1.77) | 1.53 (1.45-1.54) | 6,270 (6,236-6,532) | 6,655 (6,621-7,463) | 1.14x | 1.06x |

Ratios are medians over the rounds. Ranges that overlap between before and after mean the difference is not distinguishable from run-to-run noise.
