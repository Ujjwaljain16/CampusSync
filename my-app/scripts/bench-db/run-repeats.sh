#!/bin/bash
# Repeated benchmark runner (used by orchestrate.sh with REPEATS>1). Runs INSIDE the container.
#   usage: run-repeats.sh <db> <OLD|NEW> <run-number>
# Prints CSV rows: db,query,run,tps,avg_ms,p50_ms,p95_ms,p99_ms,n_transactions
# Differences from run.sh (the runner of the first reported run):
#   * the insert test runs a FIXED number of transactions (-t) and deletes its rows afterwards, so both schemas see
#     the same table size at the start of every run (a time-based run lets the faster schema add more rows);
#   * the unbounded pending query (q1b, mirrors the application route) is included.
DB=$1; V=$2; RUN=$3
DEL="delete from public.certificates where file_url = 'https://example/x.pdf' and title = 'T' and institution = 'I'"
for q in q1_review_queue q1b_review_queue_unbounded q2_student_certs q3_org_analytics q4_vc_lookup_$V q5_audit_org q6_role_lookup q7_insert_$V; do
  f=/tmp/q/$q.sql
  case $q in
    q7_*) mode="-t 3000" ;;     # 8 clients x 3000 = 24,000 inserts
    *)    mode="-T 20" ;;
  esac
  pgbench -U postgres -n -c 8 -j 4 -T 5 -f $f $DB >/dev/null 2>&1     # warm-up, not recorded
  case $q in q7_*) psql -U postgres -d $DB -qAtc "$DEL" >/dev/null 2>&1 ;; esac
  rm -f /tmp/pgb_log*
  out=$(cd /tmp && pgbench -U postgres -n -c 8 -j 4 $mode -l --log-prefix=/tmp/pgb_log -f $f $DB 2>&1)
  tps=$(echo "$out" | awk '/^tps/{print $3}')
  cat /tmp/pgb_log* | awk '{print $3}' | sort -n > /tmp/lat.txt
  n=$(wc -l < /tmp/lat.txt)
  p50=$(awk -v n=$n 'NR==int(n*0.50)+1{print $1/1000}' /tmp/lat.txt)
  p95=$(awk -v n=$n 'NR==int(n*0.95)+1{print $1/1000}' /tmp/lat.txt)
  p99=$(awk -v n=$n 'NR==int(n*0.99)+1{print $1/1000}' /tmp/lat.txt)
  avg=$(awk '{s+=$1} END{print s/NR/1000}' /tmp/lat.txt)
  echo "$DB,$q,$RUN,$tps,$avg,$p50,$p95,$p99,$n"
  case $q in q7_*) psql -U postgres -d $DB -qAtc "$DEL" >/dev/null 2>&1; psql -U postgres -d $DB -qAtc "vacuum analyze public.certificates" >/dev/null 2>&1 ;; esac
done
