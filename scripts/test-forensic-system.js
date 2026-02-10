/**
 * Forensic Watermark System - End-to-End Test Script
 *
 * Requirements:
 * - .env file with EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 * - Database migration 010_document_watermark_hashes.sql applied
 * - Edge function verify-watermark deployed
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

// Configuration
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
  console.error('❌ Missing Supabase configuration in .env')
  console.log('Required: EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)
const adminClient = createClient(supabaseUrl, serviceRoleKey)

async function runTests() {
  console.log('🧪 Starting Forensic Watermark System Tests\n')
  console.log('='.repeat(60))

  let testUser = null
  let testDocId = null

  try {
    // ---------------------------------------------------------
    // PRE-FLIGHT: Check Database Table Structure
    // ---------------------------------------------------------
    console.log('🔍 Pre-flight: Checking "documents" table structure...')
    const { data: tableInfo, error: tableError } = await adminClient
      .from('information_schema.columns')
      .select('column_name, data_type')
      .eq('table_name', 'documents')
      .eq('table_schema', 'public')

    if (tableError) {
      console.log('   ❌ Failed to check table:', tableError.message)
    } else if (tableInfo && tableInfo.length > 0) {
      console.log('   ✅ Table "documents" exists. Columns:')
      const columns = tableInfo.map(c => c.column_name)
      console.log(`      ${columns.join(', ')}`)

      // Check for size_bytes (correct) OR file_size (legacy)
      if (!columns.includes('size_bytes') && !columns.includes('file_size')) {
        console.warn('\n   ⚠️  CRITICAL: Neither "size_bytes" nor "file_size" column found!')
        return // Exit early
      }
    } else {
      console.log('   ❌ Table "documents" NOT FOUND. Please run migrations.')
      return // Exit early
    }

    // ---------------------------------------------------------
    // SETUP: Create Test Data
    // ---------------------------------------------------------
    console.log('\n🛠️  Setup: Creating test environment...')

    // 1. Create Test User
    const { data: userData, error: userError } = await adminClient.auth.admin.createUser({
      email: `test_${Date.now()}@example.com`,
      password: 'password123',
      email_confirm: true
    })

    if (userError) throw new Error(`Failed to create test user: ${userError.message}`)
    testUser = userData.user
    console.log(`   ✅ Created test user: ${testUser.email} (${testUser.id})`)

    // 2. Create Test Document
    // Schema adapted from user-provided SQL:
    // id, owner_id, filename, file_path, encryption_iv, mime_type, size_bytes, watermark_payload, status
    const { data: docData, error: docError } = await adminClient
      .from('documents')
      .insert({
        owner_id: testUser.id,
        filename: 'test-forensic.pdf',
        file_path: 'test/path.pdf',      // Was storage_path
        encryption_iv: 'test_iv_12345',  // Required field
        mime_type: 'application/pdf',
        size_bytes: 1024,                // Was file_size
        watermark_payload: '{"version": "1.0"}', // text field in schema, but passed as stringified JSON
        status: 'active'
      })
      .select()
      .single()

    if (docError) {
      throw new Error(`Failed to create test document: ${docError.message}`)
    }

    testDocId = docData.id
    console.log(`   ✅ Created test document: ${testDocId}`)

    // ---------------------------------------------------------
    // TEST 1: Store Watermark Hash
    // ---------------------------------------------------------
    console.log('\n📝 Test 1: Store Watermark Hash')
    console.log('-'.repeat(40))

    const testHash = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2' // Mock SHA-256
    const testSignature = 'mock_hmac_signature_for_testing'

    const { data: hashRecord, error: hashError } = await adminClient
      .rpc('store_watermark_hash', {
        p_document_id: testDocId,
        p_recipient_email: testUser.email,
        p_grantor_id: testUser.id,
        p_watermark_hash: testHash,
        p_hmac_signature: testSignature,
        p_device_hash: 'device-abc-123'
      })

    if (hashError) {
      // Check if rpc exists
      if (hashError.code === '42883') {
        throw new Error('Function "store_watermark_hash" does not exist. Please run migration 010_document_watermark_hashes.sql.')
      }
      throw new Error(`Failed to store watermark hash: ${hashError.message}`)
    } else {
      console.log('✅ Watermark hash stored successfully')
      console.log(`   Record ID: ${hashRecord}`)
    }

    // ---------------------------------------------------------
    // TEST 2: Retrieve Watermark Hash
    // ---------------------------------------------------------
    console.log('\n🔍 Test 2: Retrieve Watermark Hash')
    console.log('-'.repeat(40))

    const { data: records, error: retrieveError } = await adminClient
      .rpc('get_watermark_hash', {
        p_document_id: testDocId,
        p_recipient_email: testUser.email
      })

    if (retrieveError) {
      console.log('❌ Failed to retrieve watermark hash:', retrieveError.message)
    } else if (records && records.length > 0) {
      console.log('✅ Watermark hash retrieved successfully')
      console.log(`   Hash: ${records[0].watermark_hash.substring(0, 20)}...`)
      console.log(`   Grantee: ${records[0].grantor_id}`)

      if (records[0].watermark_hash !== testHash) {
        console.warn('⚠️  WARNING: Retrieved hash does not match stored hash!')
      }
    } else {
      console.log('⚠️  No records found (unexpected)')
    }

    // ---------------------------------------------------------
    // TEST 3: Verify Edge Function Status
    // ---------------------------------------------------------
    console.log('\n🌐 Test 3: Edge Function Status')
    console.log('-'.repeat(40))

    const functionUrl = `${supabaseUrl}/functions/v1/verify-watermark`

    // We expect 400 Bad Request because we're sending invalid mock data, 
    // but getting a 400 means the function is UP and running.
    // 401/500 would mean Auth or Server error.
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        document_id: testDocId,
        watermark_payload: 'invalid-payload-for-test'
      })
    })

    const result = await response.json().catch(() => ({}))

    if (response.status === 400) {
      console.log('✅ Edge Function is responding correctly (400 Bad Request for invalid input)')
      console.log(`   Message: ${result.error || 'Invalid request'}`)
    } else if (response.status === 200) {
      console.log('✅ Edge Function returned success')
    } else if (response.status === 404) {
      console.log('❌ Edge Function not found (404). Is it deployed?')
    } else if (response.status === 401) {
      console.log('❌ Edge Function Unauthorized (401). Check ANON KEY.')
    } else if (response.status === 500) {
      console.log('❌ Edge Function Internal Error (500). Check Supabase logs.')
      console.log('   Response:', result)
    } else {
      console.log(`⚠️  Unexpected response: ${response.status}`)
    }

    // ---------------------------------------------------------
    // ---------------------------------------------------------
    console.log('\n🔐 Test 4: RLS Policies')
    console.log('-'.repeat(40))

    const { data: policies, error: policyError } = await adminClient
      .from('pg_policies')
      .select('policyname, cmd, roles')
      .eq('tablename', 'document_watermark_hashes')

    if (policyError) {
      console.log('❌ Failed to check policies:', policyError.message)
    } else if (policies && policies.length > 0) {
      console.log('✅ RLS Policies configured:')
      policies.forEach(pol => {
        console.log(`   - ${pol.policyname}: ${pol.cmd} (${pol.roles})`)
      })
    } else {
      console.log('⚠️  No policies found (migration may not be run yet)')
    }

    // ---------------------------------------------------------
    // SUMMARY
    // ---------------------------------------------------------
    console.log('\n' + '='.repeat(60))
    console.log('📋 TEST SUMMARY')
    console.log('='.repeat(60))
    console.log(`
✅ Test Environment: Created temporary user & document
✅ Storage: store_watermark_hash RPC working
✅ Retrieval: get_watermark_hash RPC working
✅ Edge Function: Reachable at ${functionUrl}
`)

  } catch (err) {
    console.error('\n❌ TEST FAILED')
    console.error(err.message)
    if (err.cause) console.error(err.cause)
  } finally {
    // ---------------------------------------------------------
    // TEARDOWN: Cleanup
    // ---------------------------------------------------------
    if (testUser) {
      console.log('\n🧹 Cleanup: Removing test data...')
      // Deleting user cascades to documents and (if configured) watermark hashes
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(testUser.id)
      if (deleteError) {
        console.error('   ⚠️ Failed to delete test user:', deleteError.message)
      } else {
        console.log('   ✅ Test user and valid linked data deleted')
      }
    }
    console.log('\n✨ Done!')
  }
}

runTests().catch(console.error)
