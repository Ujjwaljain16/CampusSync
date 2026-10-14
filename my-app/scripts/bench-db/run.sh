#!/bin/bash
# usage: run.sh <db> <variant OLD|NEW> ; prints CSV: db,query,tps,avg_ms,p50_ms,p95_ms,p99_ms
DB=$1; V=$2
for q in q1_review_queue q2_student_certs q3_org_analytics q4_vc_lookup_$V q5_audit_org q6_role_lookup q7_insert_$V; do
  f=/tmp/q/$q.sql
  # warm-up (not recorded)
  pgbench -U postgres -n -c 8 -j 4 -T 5 -f $f $DB >/dev/null 2>&1
  rm -f /tmp/pgb_log*
  out=$(cd /tmp && pgbench -U postgres -n -c 8 -j 4 -T 20 -l --log-prefix=/tmp/pgb_log -f $f $DB 2>&1)
  tps=$(echo "$out" | awk '/^tps/{print $3}')
  cat /tmp/pgb_log* | awk '{print $3}' | sort -n > /tmp/lat.txt
  n=$(wc -l < /tmp/lat.txt)
  p50=$(awk -v n=$n 'NR==int(n*0.50)+1{print $1/1000}' /tmp/lat.txt)
  p95=$(awk -v n=$n 'NR==int(n*0.95)+1{print $1/1000}' /tmp/lat.txt)
  p99=$(awk -v n=$n 'NR==int(n*0.99)+1{print $1/1000}' /tmp/lat.txt)
  avg=$(awk '{s+=$1} END{print s/NR/1000}' /tmp/lat.txt)
  echo "$DB,$q,$tps,$avg,$p50,$p95,$p99,$n"
done
