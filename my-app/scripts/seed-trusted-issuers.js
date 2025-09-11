const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seedTrustedIssuers() {
  console.log('Seeding trusted issuers...');

  // Sample trusted issuers with enhanced data
  const issuers = [
    {
      name: 'Coursera',
      domain: 'coursera.org',
      template_patterns: [
        'This is to certify that',
        'has successfully completed',
        'Coursera',
        'certificate of completion',
        'Coursera Inc.'
      ],
      confidence_threshold: 0.9,
      qr_verification_url: 'https://coursera.org/verify/',
      is_active: true
    },
    {
      name: 'edX',
      domain: 'edx.org',
      template_patterns: [
        'This is to certify that',
        'has successfully completed',
        'edX',
        'certificate of achievement',
        'Massachusetts Institute of Technology'
      ],
      confidence_threshold: 0.9,
      qr_verification_url: 'https://credentials.edx.org/credentials/',
      is_active: true
    },
    {
      name: 'Udemy',
      domain: 'udemy.com',
      template_patterns: [
        'Certificate of Completion',
        'has successfully completed',
        'Udemy',
        'course completion',
        'Udemy Inc.'
      ],
      confidence_threshold: 0.85,
      qr_verification_url: 'https://udemy.com/certificate/',
      is_active: true
    },
    {
      name: 'NPTEL',
      domain: 'nptel.ac.in',
      template_patterns: [
        'National Programme on Technology Enhanced Learning',
        'Indian Institute of Technology',
        'NPTEL',
        'certificate of completion',
        'IIT'
      ],
      confidence_threshold: 0.95,
      qr_verification_url: 'https://nptel.ac.in/verify/',
      is_active: true
    },
    {
      name: 'Google',
      domain: 'google.com',
      template_patterns: [
        'Google',
        'certificate of completion',
        'has successfully completed',
        'Google Career Certificates',
        'Google LLC'
      ],
      confidence_threshold: 0.9,
      qr_verification_url: 'https://www.credly.com/badges/',
      is_active: true
    },
    {
      name: 'Microsoft',
      domain: 'microsoft.com',
      template_patterns: [
        'Microsoft',
        'certificate of completion',
        'Microsoft Learn',
        'has successfully completed',
        'Microsoft Corporation'
      ],
      confidence_threshold: 0.9,
      qr_verification_url: 'https://learn.microsoft.com/api/credentials/',
      is_active: true
    },
    {
      name: 'AWS',
      domain: 'amazon.com',
      template_patterns: [
        'Amazon Web Services',
        'AWS',
        'certificate of completion',
        'has successfully completed',
        'Amazon Web Services Inc.'
      ],
      confidence_threshold: 0.9,
      qr_verification_url: 'https://aws.amazon.com/verification/',
      is_active: true
    },
    {
      name: 'IBM',
      domain: 'ibm.com',
      template_patterns: [
        'IBM',
        'certificate of completion',
        'has successfully completed',
        'IBM SkillsBuild',
        'International Business Machines'
      ],
      confidence_threshold: 0.9,
      qr_verification_url: 'https://skillsbuild.org/verify/',
      is_active: true
    }
  ];

  try {
    // Clear existing data
    await supabase.from('trusted_issuers').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    // Insert new data
    const { data, error } = await supabase
      .from('trusted_issuers')
      .insert(issuers);

    if (error) {
      console.error('Error seeding trusted issuers:', error);
      return;
    }

    console.log('Successfully seeded trusted issuers:', data?.length || issuers.length);
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the seeding
seedTrustedIssuers();
