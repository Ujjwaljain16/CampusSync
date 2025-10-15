/**
 * Database Schema Analysis and Testing Script
 * 
 * Purpose: Connect to Supabase and analyze current database schema
 * - List all tables
 * - Show column details
 * - Check indexes
 * - Identify redundancies
 * - Test RLS policies
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client with service role key (full access)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function separator(char = '=', length = 80) {
  log(char.repeat(length), 'cyan');
}

async function analyzeSchema() {
  try {
    log('\n🔍 DATABASE SCHEMA ANALYSIS STARTING...', 'bright');
    separator();

    // =====================================================
    // 1. GET ALL TABLES
    // =====================================================
    log('\n📊 STEP 1: Fetching all tables...', 'cyan');
    
    // Known tables from your schema
    const tablesList = [
      'profiles',
      'user_roles',
      'certificates',
      'certificate_metadata',
      'documents',
      'audit_logs',
      'role_requests',
      'trusted_issuers',
      'allowed_domains',
      'verification_rules',
      'vc_status_list',
      'vc_revocations',
      'recruiter_favorites',
      'recruiter_pipeline',
      'recruiter_contacts',
      'recruiter_saved_searches',
      'recruiter_pipeline_stages',
      'recruiter_pipeline_candidates',
    ];

    log(`\n✅ Found ${tablesList.length} known tables`, 'green');
    
    // =====================================================
    // 2. ANALYZE EACH TABLE
    // =====================================================
    log('\n📋 STEP 2: Analyzing table structures...', 'cyan');
    separator();

    const schemaAnalysis = {};

    for (const tableName of tablesList) {
      log(`\n🔍 Analyzing: ${tableName}`, 'yellow');
      
      try {
        // Get row count
        const { count, error: countError } = await supabase
          .from(tableName)
          .select('*', { count: 'exact', head: true });

        if (countError) {
          log(`  ⚠️  Cannot access table: ${countError.message}`, 'red');
          continue;
        }

        // Get sample data to determine columns
        const { data: sampleData } = await supabase
          .from(tableName)
          .select('*')
          .limit(1);

        const columns = sampleData && sampleData[0] ? Object.keys(sampleData[0]) : [];

        schemaAnalysis[tableName] = {
          rowCount: count || 0,
          columns: columns,
          columnCount: columns.length,
        };

        log(`  ✅ Rows: ${count || 0} | Columns: ${columns.length}`, 'green');
        if (columns.length > 0) {
          log(`  📝 Columns: ${columns.join(', ')}`, 'blue');
        }

      } catch (error) {
        log(`  ❌ Error: ${error.message}`, 'red');
      }
    }

    // =====================================================
    // 3. IDENTIFY ISSUES
    // =====================================================
    log('\n\n🔍 STEP 3: Identifying potential issues...', 'cyan');
    separator();

    const issues = [];
    const recommendations = [];

    // Check for duplicate columns
    log('\n📌 Checking for redundant columns...', 'yellow');
    
    if (schemaAnalysis.certificates) {
      const certCols = schemaAnalysis.certificates.columns;
      
      if (certCols.includes('student_id') && certCols.includes('user_id')) {
        issues.push({
          table: 'certificates',
          issue: 'Duplicate columns: student_id and user_id (both reference same user)',
          severity: 'HIGH',
          recommendation: 'Remove user_id, keep only student_id for clarity'
        });
      }

      if (certCols.includes('certificate_name') && certCols.includes('title')) {
        issues.push({
          table: 'certificates',
          issue: 'Potential duplicate: certificate_name and title',
          severity: 'MEDIUM',
          recommendation: 'Consolidate into single "title" column'
        });
      }

      if (certCols.includes('issuer_id') && certCols.includes('faculty_id')) {
        issues.push({
          table: 'certificates',
          issue: 'Two issuer references: issuer_id and faculty_id',
          severity: 'MEDIUM',
          recommendation: 'Clarify: issuer_id for original issuer, faculty_id for approver'
        });
      }
    }

    if (schemaAnalysis.audit_logs) {
      const auditCols = schemaAnalysis.audit_logs.columns;
      
      if (auditCols.includes('actor_id') && auditCols.includes('user_id')) {
        issues.push({
          table: 'audit_logs',
          issue: 'Two user references: actor_id and user_id',
          severity: 'MEDIUM',
          recommendation: 'Keep actor_id (who did it), remove user_id or clarify its purpose'
        });
      }
    }

    // Check for empty tables
    log('\n📌 Checking for unused tables...', 'yellow');
    
    Object.entries(schemaAnalysis).forEach(([table, info]) => {
      if (info.rowCount === 0) {
        recommendations.push({
          table,
          type: 'EMPTY_TABLE',
          message: `Table "${table}" has no data - may be unused or ready for implementation`,
          action: 'Review if needed, consider removing if not in use'
        });
      }
    });

    // Check for missing indexes (we'll add these later)
    log('\n📌 Checking for missing critical indexes...', 'yellow');
    
    const criticalIndexes = [
      { table: 'certificates', column: 'student_id', reason: 'Most common query filter' },
      { table: 'certificates', column: 'status', reason: 'Status filtering' },
      { table: 'user_roles', column: 'user_id', reason: 'Auth lookup (critical)' },
      { table: 'audit_logs', column: 'user_id', reason: 'User activity tracking' },
      { table: 'recruiter_favorites', column: 'recruiter_id', reason: 'Recruiter queries' },
    ];

    recommendations.push({
      type: 'MISSING_INDEXES',
      message: 'Critical indexes should be added (see performance-indexes.sql)',
      tables: criticalIndexes.map(i => `${i.table}(${i.column})`).join(', ')
    });

    // =====================================================
    // 4. DISPLAY RESULTS
    // =====================================================
    log('\n\n📊 ANALYSIS SUMMARY', 'bright');
    separator();

    log('\n📈 Table Statistics:', 'cyan');
    Object.entries(schemaAnalysis).forEach(([table, info]) => {
      const status = info.rowCount > 0 ? '✅' : '⚠️';
      log(`  ${status} ${table.padEnd(35)} | Rows: ${String(info.rowCount).padStart(5)} | Cols: ${info.columnCount}`, 
        info.rowCount > 0 ? 'green' : 'yellow');
    });

    log('\n\n⚠️  ISSUES FOUND:', 'red');
    if (issues.length === 0) {
      log('  ✅ No critical issues detected!', 'green');
    } else {
      issues.forEach((issue, idx) => {
        log(`\n  ${idx + 1}. [${issue.severity}] ${issue.table}`, 'yellow');
        log(`     Issue: ${issue.issue}`, 'red');
        log(`     Fix: ${issue.recommendation}`, 'green');
      });
    }

    log('\n\n💡 RECOMMENDATIONS:', 'magenta');
    recommendations.forEach((rec, idx) => {
      if (rec.table) {
        log(`\n  ${idx + 1}. ${rec.table}`, 'yellow');
        log(`     ${rec.message}`, 'blue');
        log(`     Action: ${rec.action}`, 'cyan');
      } else {
        log(`\n  ${idx + 1}. ${rec.type}`, 'yellow');
        log(`     ${rec.message}`, 'blue');
        if (rec.tables) log(`     Tables: ${rec.tables}`, 'cyan');
      }
    });

    // =====================================================
    // 5. GENERATE OPTIMIZATION REPORT
    // =====================================================
    log('\n\n📄 Generating detailed report...', 'cyan');
    
    const report = {
      timestamp: new Date().toISOString(),
      totalTables: Object.keys(schemaAnalysis).length,
      tablesWithData: Object.values(schemaAnalysis).filter(t => t.rowCount > 0).length,
      emptyTables: Object.values(schemaAnalysis).filter(t => t.rowCount === 0).length,
      totalRows: Object.values(schemaAnalysis).reduce((sum, t) => sum + t.rowCount, 0),
      issues: issues,
      recommendations: recommendations,
      tables: schemaAnalysis,
    };

    // Save report to file
    const fs = await import('fs');
    const reportPath = './database-analysis-report.json';
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    log(`\n✅ Detailed report saved to: ${reportPath}`, 'green');

    // =====================================================
    // 6. SPECIFIC TABLE CHECKS
    // =====================================================
    log('\n\n🔍 STEP 4: Detailed table validation...', 'cyan');
    separator();

    // Check profiles table
    log('\n📋 Validating PROFILES table...', 'yellow');
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email, full_name, created_at')
      .limit(5);
    
    if (profiles) {
      log(`  ✅ Sample profiles found: ${profiles.length}`, 'green');
      profiles.forEach(p => {
        log(`    - ${p.email || 'No email'} | ${p.full_name || 'No name'}`, 'blue');
      });
    }

    // Check user_roles table
    log('\n📋 Validating USER_ROLES table...', 'yellow');
    const { data: roles } = await supabase
      .from('user_roles')
      .select('user_id, role, assigned_by, created_at')
      .limit(5);
    
    if (roles) {
      log(`  ✅ Sample roles found: ${roles.length}`, 'green');
      const roleCounts = roles.reduce((acc, r) => {
        acc[r.role] = (acc[r.role] || 0) + 1;
        return acc;
      }, {});
      Object.entries(roleCounts).forEach(([role, count]) => {
        log(`    - ${role}: ${count} user(s)`, 'blue');
      });
    }

    // Check certificates table
    log('\n📋 Validating CERTIFICATES table...', 'yellow');
    const { data: certs } = await supabase
      .from('certificates')
      .select('id, student_id, status, created_at')
      .limit(5);
    
    if (certs) {
      log(`  ✅ Sample certificates found: ${certs.length}`, 'green');
      const statusCounts = certs.reduce((acc, c) => {
        acc[c.status || 'unknown'] = (acc[c.status || 'unknown'] || 0) + 1;
        return acc;
      }, {});
      Object.entries(statusCounts).forEach(([status, count]) => {
        log(`    - ${status}: ${count} certificate(s)`, 'blue');
      });
    }

    separator();
    log('\n✅ DATABASE ANALYSIS COMPLETE!', 'bright');
    log('\nNext steps:', 'cyan');
    log('  1. Review database-analysis-report.json', 'blue');
    log('  2. Apply recommended fixes (see issues above)', 'blue');
    log('  3. Run database/performance-indexes.sql for optimization', 'blue');
    log('  4. Remove unused columns/tables', 'blue');
    separator();

  } catch (error) {
    log('\n❌ ANALYSIS FAILED', 'red');
    log(`Error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

// Run the analysis
analyzeSchema()
  .then(() => {
    log('\n✅ Script completed successfully', 'green');
    process.exit(0);
  })
  .catch((error) => {
    log('\n❌ Script failed', 'red');
    console.error(error);
    process.exit(1);
  });
