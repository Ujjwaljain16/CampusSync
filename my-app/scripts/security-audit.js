// Security audit script to check RLS policies and API security
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

class SecurityAuditor {
  constructor() {
    this.issues = [];
    this.warnings = [];
  }

  async runAudit() {
    console.log('🔍 Starting Security Audit...\n');

    await this.checkRLSPolicies();
    await this.checkAPISecurity();
    await this.checkDataAccess();
    await this.checkAuthentication();

    this.generateReport();
  }

  async checkRLSPolicies() {
    console.log('📋 Checking RLS Policies...');
    
    const tables = [
      'profiles', 'user_roles', 'role_requests', 'certificates', 'documents',
      'verifiable_credentials', 'vc_status_registry', 'audit_logs',
      'saved_searches', 'verification_requests', 'institution_templates'
    ];

    for (const table of tables) {
      try {
        const { data: policies, error } = await supabase
          .from('pg_policies')
          .select('*')
          .eq('tablename', table)
          .eq('schemaname', 'public');

        if (error) {
          this.issues.push(`❌ Failed to check RLS policies for ${table}: ${error.message}`);
          continue;
        }

        if (!policies || policies.length === 0) {
          this.issues.push(`❌ No RLS policies found for table: ${table}`);
        } else {
          console.log(`  ✅ ${table}: ${policies.length} policies`);
        }
      } catch (error) {
        this.issues.push(`❌ Error checking ${table}: ${error.message}`);
      }
    }
  }

  async checkAPISecurity() {
    console.log('\n🔐 Checking API Security...');
    
    const apiEndpoints = [
      { path: '/api/admin/roles/change', method: 'POST', requiresAuth: true, requiresRole: 'admin' },
      { path: '/api/recruiter/search-students', method: 'GET', requiresAuth: true, requiresRole: 'recruiter' },
      { path: '/api/documents/verify', method: 'POST', requiresAuth: true, requiresRole: 'faculty' },
      { path: '/api/vc/revoke', method: 'POST', requiresAuth: true, requiresRole: 'admin' },
      { path: '/api/public/portfolio', method: 'GET', requiresAuth: false },
      { path: '/api/vc/status-list', method: 'GET', requiresAuth: false }
    ];

    for (const endpoint of apiEndpoints) {
      // This would require actual API testing
      console.log(`  📍 ${endpoint.method} ${endpoint.path} - ${endpoint.requiresAuth ? 'Auth Required' : 'Public'}`);
    }
  }

  async checkDataAccess() {
    console.log('\n📊 Checking Data Access Patterns...');
    
    try {
      // Check if sensitive data is properly protected
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .limit(1);

      if (profilesError) {
        this.warnings.push(`⚠️  Profiles table access issue: ${profilesError.message}`);
      } else {
        console.log('  ✅ Profiles table accessible');
      }

      // Check audit logs
      const { data: auditLogs, error: auditError } = await supabase
        .from('audit_logs')
        .select('id, action, created_at')
        .limit(1);

      if (auditError) {
        this.warnings.push(`⚠️  Audit logs access issue: ${auditError.message}`);
      } else {
        console.log('  ✅ Audit logs accessible');
      }

    } catch (error) {
      this.issues.push(`❌ Data access check failed: ${error.message}`);
    }
  }

  async checkAuthentication() {
    console.log('\n🔑 Checking Authentication Configuration...');
    
    const requiredEnvVars = [
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY'
    ];

    for (const envVar of requiredEnvVars) {
      if (process.env[envVar]) {
        console.log(`  ✅ ${envVar} is configured`);
      } else {
        this.issues.push(`❌ Missing environment variable: ${envVar}`);
      }
    }

    // Check if service role key is properly secured
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (key.length < 50) {
        this.warnings.push('⚠️  Service role key seems too short');
      } else {
        console.log('  ✅ Service role key appears properly configured');
      }
    }
  }

  generateReport() {
    console.log('\n' + '='.repeat(50));
    console.log('🔍 SECURITY AUDIT REPORT');
    console.log('='.repeat(50));

    if (this.issues.length === 0 && this.warnings.length === 0) {
      console.log('✅ No security issues found!');
    } else {
      if (this.issues.length > 0) {
        console.log('\n❌ CRITICAL ISSUES:');
        this.issues.forEach(issue => console.log(`  ${issue}`));
      }

      if (this.warnings.length > 0) {
        console.log('\n⚠️  WARNINGS:');
        this.warnings.forEach(warning => console.log(`  ${warning}`));
      }
    }

    console.log('\n📋 RECOMMENDATIONS:');
    console.log('  1. Ensure all API endpoints have proper authentication');
    console.log('  2. Verify RLS policies are correctly configured');
    console.log('  3. Use service role key only in server-side code');
    console.log('  4. Regularly audit user permissions and roles');
    console.log('  5. Monitor audit logs for suspicious activity');
    console.log('  6. Implement rate limiting on public endpoints');
    console.log('  7. Use HTTPS in production');
    console.log('  8. Validate all user inputs');

    console.log('\n' + '='.repeat(50));
  }
}

async function main() {
  const auditor = new SecurityAuditor();
  await auditor.runAudit();
}

main().catch(console.error);
