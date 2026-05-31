/**
 * Manual API Test Script for File Upload Endpoint
 * 
 * This script tests the POST /api/upload/file endpoint.
 * Run after starting the dev server.
 * 
 * Usage:
 *   1. Start dev server: npm run dev
 *   2. Run this script: npx ts-node src/app/api/upload/__tests__/file-upload-api.manual-test.ts
 */

import { promises as fs } from 'fs'
import path from 'path'

const API_BASE_URL = 'http://localhost:3000'

interface TestResult {
  name: string
  passed: boolean
  error?: string
}

const results: TestResult[] = []

function logTest(name: string, passed: boolean, error?: string) {
  results.push({ name, passed, error })
  const icon = passed ? '✅' : '❌'
  console.log(`${icon} ${name}`)
  if (error) {
    console.log(`   Error: ${error}`)
  }
}

/**
 * Create a test file buffer
 */
function createTestFile(content: string, filename: string): FormData {
  const blob = new Blob([content], { type: 'text/plain' })
  const formData = new FormData()
  formData.append('file', blob, filename)
  formData.append('workspace', 'general_chat')
  return formData
}

/**
 * Upload file to API
 */
async function uploadFile(formData: FormData): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/api/upload/file`, {
    method: 'POST',
    body: formData,
  })

  return await response.json()
}

/**
 * Get user files from API
 */
async function getUserFiles(workspace?: string): Promise<any> {
  const url = workspace
    ? `${API_BASE_URL}/api/upload/file?workspace=${workspace}`
    : `${API_BASE_URL}/api/upload/file`

  const response = await fetch(url, {
    method: 'GET',
  })

  return await response.json()
}

async function runTests() {
  console.log('='.repeat(60))
  console.log('File Upload API Manual Tests')
  console.log('='.repeat(60))
  console.log('')
  console.log(`Testing against: ${API_BASE_URL}`)
  console.log('Note: These tests require authentication')
  console.log('')

  // Test 1: Upload valid text file
  try {
    const formData = createTestFile('This is a test file', 'test.txt')
    const result = await uploadFile(formData)

    logTest(
      'Test 1: Upload valid text file',
      result.success === true && result.data?.fileId
    )

    if (result.success) {
      console.log(`   File ID: ${result.data.fileId}`)
      console.log(`   S3 URL: ${result.data.s3Url}`)
      console.log(`   Analysis: ${result.data.analysis.substring(0, 50)}...`)
    }
  } catch (error: any) {
    logTest('Test 1: Upload valid text file', false, error.message)
  }

  // Test 2: Upload PDF file
  try {
    const formData = new FormData()
    const blob = new Blob(['PDF content'], { type: 'application/pdf' })
    formData.append('file', blob, 'document.pdf')
    formData.append('workspace', 'smart_summarizer')

    const result = await uploadFile(formData)

    logTest(
      'Test 2: Upload PDF to smart summarizer',
      result.success === true && result.data?.analysis?.includes('summary')
    )
  } catch (error: any) {
    logTest('Test 2: Upload PDF to smart summarizer', false, error.message)
  }

  // Test 3: Upload with session ID
  try {
    const formData = createTestFile('Session test', 'session-test.txt')
    formData.append('sessionId', 'test-session-123')

    const result = await uploadFile(formData)

    logTest(
      'Test 3: Upload with session ID',
      result.success === true
    )
  } catch (error: any) {
    logTest('Test 3: Upload with session ID', false, error.message)
  }

  // Test 4: Upload to debug workspace
  try {
    const formData = createTestFile('function test() { return true; }', 'code.txt')
    formData.set('workspace', 'debug')

    const result = await uploadFile(formData)

    logTest(
      'Test 4: Upload to debug workspace',
      result.success === true && result.data?.analysis?.includes('debug')
    )
  } catch (error: any) {
    logTest('Test 4: Upload to debug workspace', false, error.message)
  }

  // Test 5: Upload image file
  try {
    const formData = new FormData()
    const blob = new Blob(['fake image data'], { type: 'image/png' })
    formData.append('file', blob, 'image.png')
    formData.append('workspace', 'image_analyzer')

    const result = await uploadFile(formData)

    logTest(
      'Test 5: Upload image to image analyzer',
      result.success === true && result.data?.analysis?.includes('image')
    )
  } catch (error: any) {
    logTest('Test 5: Upload image to image analyzer', false, error.message)
  }

  // Test 6: Upload CSV to data analyst
  try {
    const csvContent = 'name,age,city\nJohn,30,NYC\nJane,25,LA'
    const formData = new FormData()
    const blob = new Blob([csvContent], { type: 'text/csv' })
    formData.append('file', blob, 'data.csv')
    formData.append('workspace', 'data_analyst')

    const result = await uploadFile(formData)

    logTest(
      'Test 6: Upload CSV to data analyst',
      result.success === true && result.data?.analysis?.includes('CSV')
    )
  } catch (error: any) {
    logTest('Test 6: Upload CSV to data analyst', false, error.message)
  }

  // Test 7: Missing file (should fail)
  try {
    const formData = new FormData()
    formData.append('workspace', 'general_chat')

    const result = await uploadFile(formData)

    logTest(
      'Test 7: Reject request without file',
      result.success === false && result.error?.includes('required')
    )
  } catch (error: any) {
    logTest('Test 7: Reject request without file', false, error.message)
  }

  // Test 8: Missing workspace (should fail)
  try {
    const formData = new FormData()
    const blob = new Blob(['test'], { type: 'text/plain' })
    formData.append('file', blob, 'test.txt')

    const result = await uploadFile(formData)

    logTest(
      'Test 8: Reject request without workspace',
      result.success === false && result.error?.includes('required')
    )
  } catch (error: any) {
    logTest('Test 8: Reject request without workspace', false, error.message)
  }

  // Test 9: Invalid file type (should fail)
  try {
    const formData = new FormData()
    const blob = new Blob(['test'], { type: 'application/exe' })
    formData.append('file', blob, 'malware.exe')
    formData.append('workspace', 'general_chat')

    const result = await uploadFile(formData)

    logTest(
      'Test 9: Reject invalid file type',
      result.success === false && result.error?.includes('not supported')
    )
  } catch (error: any) {
    logTest('Test 9: Reject invalid file type', false, error.message)
  }

  // Test 10: File too large (should fail with 413)
  try {
    const largeContent = 'x'.repeat(11 * 1024 * 1024) // 11MB
    const formData = new FormData()
    const blob = new Blob([largeContent], { type: 'text/plain' })
    formData.append('file', blob, 'large.txt')
    formData.append('workspace', 'general_chat')

    const result = await uploadFile(formData)

    logTest(
      'Test 10: Reject file exceeding 10MB',
      result.success === false && result.error?.includes('10MB')
    )
  } catch (error: any) {
    logTest('Test 10: Reject file exceeding 10MB', false, error.message)
  }

  // Test 11: Get user files (GET endpoint)
  try {
    const result = await getUserFiles()

    logTest(
      'Test 11: Get all user files',
      result.success === true && Array.isArray(result.data?.files)
    )

    if (result.success) {
      console.log(`   Found ${result.data.count} files`)
    }
  } catch (error: any) {
    logTest('Test 11: Get all user files', false, error.message)
  }

  // Test 12: Get files filtered by workspace
  try {
    const result = await getUserFiles('general_chat')

    logTest(
      'Test 12: Get files filtered by workspace',
      result.success === true && Array.isArray(result.data?.files)
    )

    if (result.success) {
      console.log(`   Found ${result.data.count} files in general_chat`)
    }
  } catch (error: any) {
    logTest('Test 12: Get files filtered by workspace', false, error.message)
  }

  // Summary
  console.log('')
  console.log('='.repeat(60))
  console.log('Test Summary')
  console.log('='.repeat(60))

  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length

  console.log(`✅ Passed: ${passed}`)
  console.log(`❌ Failed: ${failed}`)
  console.log(`📊 Total: ${results.length}`)

  if (failed === 0) {
    console.log('')
    console.log('🎉 All tests passed!')
  } else {
    console.log('')
    console.log('⚠️  Some tests failed. Review the output above.')
    console.log('')
    console.log('Common issues:')
    console.log('- Server not running (npm run dev)')
    console.log('- Not authenticated (login required)')
    console.log('- MongoDB not configured')
    console.log('- AWS S3 not configured')
  }
}

// ============================================================================
// Jest wrapper — manual API test script requiring a live server.
// ============================================================================

describe('file-upload-api manual test (requires live server)', () => {
  it('is a manual API test script — skipped in unit test runs', () => {
    expect(true).toBe(true)
  })
})

// Only run when executed directly (not under Jest)
if (typeof jest === 'undefined') {
  runTests().catch(console.error)
}
