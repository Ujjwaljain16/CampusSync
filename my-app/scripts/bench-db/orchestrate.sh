#!/bin/bash
# Database benchmark: the ORIGINAL schema vs the schema after the 20261015 cleanup migrations, on real PostgreSQL 17
# at about 1M certificates. Needs Docker. Run from anywhere:   bash my-app/scripts/bench-db/orchestrate.sh
# It creates a throwaway container (cs-bench) and writes results to ./bench-out next to your current directory.
# Disk: about 6-8 GB inside Docker at the peak. Remove afterwards with:  docker rm -f -v cs-bench
export MSYS_NO_PATHCONV=1
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="$(cd "$HERE/../.." && pwd)"
M="$APP/supabase/migrations"
OUT="$(pwd)/bench-out"; mkdir -p "$OUT"
log() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$OUT/progress.log"; }
: > "$OUT/progress.log"

log "start postgres:17 (shared_buffers=1GB, 4 vCPU recommended)"
docker rm -f cs-bench >/dev/null 2>&1
docker run -d --name cs-bench -e POSTGRES_PASSWORD=bench --shm-size=1g postgres:17 \
  -c shared_buffers=1GB -c effective_cache_size=3GB -c max_connections=100 -c work_mem=16MB >/dev/null || exit 1
for i in $(seq 1 30); do docker exec cs-bench pg_isready -U postgres >/dev/null 2>&1 && break; sleep 2; done

docker exec cs-bench mkdir -p /tmp/q /tmp/mig

# record the environment of THIS run (added after the run reported in docs/BENCHMARKS.md)
{
  echo "date_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "git_revision=$(git -C "$APP" rev-parse HEAD 2>/dev/null)"
  echo "git_dirty=$(git -C "$APP" status --porcelain 2>/dev/null | wc -l) changed files"
  docker --version
  docker info --format 'docker_cpus={{.NCPU}} docker_mem_bytes={{.MemTotal}} docker_server={{.ServerVersion}} docker_os={{.OperatingSystem}}'
  echo "image_digest=$(docker image inspect postgres:17 --format '{{index .RepoDigests 0}}' 2>/dev/null)"
  docker exec cs-bench psql -U postgres -Atc "select 'postgres_version=' || version()"
  for k in shared_buffers effective_cache_size work_mem max_connections fsync synchronous_commit random_page_cost; do
    docker exec cs-bench psql -U postgres -Atc "select '$k=' || current_setting('$k')"
  done
  docker exec cs-bench pgbench --version
  echo "host_cpu=$(wmic cpu get name 2>/dev/null | sed -n 2p | tr -d '' || true)"
} > "$OUT/environment.txt" 2>&1
docker cp "$HERE/q/." cs-bench:/tmp/q/
for f in run.sh seed.sql explain_OLD.sql explain_NEW.sql; do docker cp "$HERE/$f" cs-bench:/tmp/$f; done
docker cp "$APP/supabase/tests/live-schema.sql" cs-bench:/tmp/live-schema.sql
for f in 00_preflight 01_expand 02_integrity 03_indexes 03b_extra_indexes 04_policies_safe 05_lock_audit_writes 06_credentials_service_only 07_default_pending 08_contract; do
  docker cp "$M/20261015_$f.sql" cs-bench:/tmp/mig/$f.sql
done

docker exec cs-bench psql -U postgres -c "create database bench_old;" >/dev/null
docker exec cs-bench psql -U postgres -d bench_old -q -v ON_ERROR_STOP=1 -f /tmp/live-schema.sql >/dev/null 2>&1 || { log "schema failed"; exit 1; }
log "seeding about 1M certificates, 1M audit rows, 280k credentials"
docker exec cs-bench psql -U postgres -d bench_old -q -v ON_ERROR_STOP=1 -f /tmp/seed.sql > "$OUT/seed.log" 2>&1 || { log "seed failed"; exit 1; }
docker exec cs-bench psql -U postgres -d bench_old -Atc "checkpoint" >/dev/null

STATS="select 'tables', count(*) from information_schema.tables where table_schema='public' and table_name not like 'bench\_%'
union all select 'indexes', count(*) from pg_indexes where schemaname='public' and tablename not like 'bench\_%'
union all select 'certificates_indexes', count(*) from pg_indexes where schemaname='public' and tablename='certificates'
union all select 'cert_index_mb', (pg_indexes_size('public.certificates')/1048576)
union all select 'audit_index_mb', (pg_indexes_size('public.audit_logs')/1048576)
union all select 'vc_index_mb', (pg_indexes_size('public.verifiable_credentials')/1048576)
union all select 'db_mb', (pg_database_size(current_database())/1048576)"
docker exec cs-bench psql -U postgres -d bench_old -At -F ',' -c "$STATS" > "$OUT/stats_old.csv"

log "benchmark OLD schema"
docker exec cs-bench bash /tmp/run.sh bench_old OLD > "$OUT/results_old.csv"
docker exec cs-bench psql -U postgres -d bench_old -q -f /tmp/explain_OLD.sql > "$OUT/explain_old.txt" 2>&1

log "clone and migrate (timed)"
docker exec cs-bench psql -U postgres -c "create database bench_new template bench_old;" >/dev/null
: > "$OUT/migration_timings.txt"
for f in 00_preflight 01_expand 02_integrity 03_indexes 03b_extra_indexes 04_policies_safe 05_lock_audit_writes 06_credentials_service_only 07_default_pending 08_contract; do
  s=$(date +%s%N)
  docker exec cs-bench psql -U postgres -d bench_new -q -v ON_ERROR_STOP=1 -f /tmp/mig/$f.sql > "$OUT/mig_$f.log" 2>&1; rc=$?
  e=$(date +%s%N)
  awk -v n=$f -v rc=$rc -v s=$s -v e=$e 'BEGIN{printf "%-32s rc=%s  %7.2f s\n", n, rc, (e-s)/1e9}' | tee -a "$OUT/migration_timings.txt"
  [ $rc -ne 0 ] && { tail -6 "$OUT/mig_$f.log"; log "migration failed at $f"; exit 1; }
done
docker exec cs-bench psql -U postgres -d bench_new -Atc "vacuum analyze" >/dev/null
docker exec cs-bench psql -U postgres -d bench_new -Atc "checkpoint" >/dev/null
docker exec cs-bench psql -U postgres -d bench_new -At -F ',' -c "$STATS" > "$OUT/stats_new.csv"

log "benchmark NEW schema"
docker exec cs-bench bash /tmp/run.sh bench_new NEW > "$OUT/results_new.csv"
docker exec cs-bench psql -U postgres -d bench_new -q -f /tmp/explain_NEW.sql > "$OUT/explain_new.txt" 2>&1
log "done; results in $OUT"
