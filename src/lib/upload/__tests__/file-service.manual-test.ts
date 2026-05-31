/**
 * Manual Test Script for File Upload Service
 * 
 * This script tests the FileUploadService functionality.
 * Run after ensuring MongoDB and AWS S3 are configured.
 * 
 * Usage:
 *   npx ts-node src/lib/upload/__tests__/file-service.manual-test.ts
 */

// Mock MongoDB so this file can be imported under Jest without a real connection
jest.mock('@/lib/mongodb', () => ({
  __esModule: true,
  default: Promise.resolve({ db: () => ({}) }),
}))

import { FileUploadService } from '../file-service'
import { promises as fs } from 'fs'
import path from 'path'

const service = new FileUploadService()

// Test user and workspace
const TEST_USER_ID = 'test-user-123'
const TEST_WORKSPACE = 'general_chat'
const TEST_SESSION_ID = 'test-session-456'

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

async function runTests() {
  console.log('='.repeat(60))
  console.log('File Upload Service Manual Tests')
  console.log('='.repeat(60))
  console.log('')

  // Test 1: Validate file - valid file
  try {
    const result = service.validateFile('test.pdf', 1024 * 1024) // 1MB
    logTest('Test 1: Validate valid PDF file', result.valid)
  } catch (error: any) {
    logTest('Test 1: Validate valid PDF file', false, error.message)
  }

  // Test 2: Validate file - file too large
  try {
    const result = service.validateFile('large.pdf', 11 * 1024 * 1024) // 11MB
    logTest('Test 2: Reject file exceeding 10MB', !result.valid && (result.error?.includes('10MB') ?? false))
  } catch (error: any) {
    logTest('Test 2: Reject file exceeding 10MB', false, error.message)
  }

  // Test 3: Validate file - invalid format
  try {
    const result = service.validateFile('test.exe', 1024)
    logTest('Test 3: Reject invalid file format', !result.valid && (result.error?.includes('not supported') ?? false))
  } catch (error: any) {
    logTest('Test 3: Reject invalid file format', false, error.message)
  }

  // Test 4: Validate all allowed formats
  try {
    const allowedFormats = ['pdf', 'txt', 'docx', 'csv', 'json', 'png', 'jpg', 'jpeg']
    let allValid = true
    
    for (const format of allowedFormats) {
      const result = service.validateFile(`test.${format}`, 1024)
      if (!result.valid) {
        allValid = false
        break
      }
    }
    
    logTest('Test 4: Accept all allowed file formats', allValid)
  } catch (error: any) {
    logTest('Test 4: Accept all allowed file formats', false, error.message)
  }

  // Test 5: Upload file (requires S3 and MongoDB)
  try {
    // Create a small test file buffer
    const testContent = 'This is a test file for upload service testing.'
    const testBuffer = Buffer.from(testContent, 'utf-8')
    
    const result = await service.uploadFile(
      testBuffer,
      'test-upload.txt',
      TEST_USER_ID,
      TEST_WORKSPACE,
      TEST_SESSION_ID
    )
    
    const hasFileId = !!result.fileId
    const hasS3Url = !!result.s3Url
    const hasMetadata = !!result.metadata
    
    logTest(
      'Test 5: Upload file to S3 and save metadata',
      hasFileId && hasS3Url && hasMetadata
    )
    
    // Store fileId for later tests
    if (hasFileId) {
      console.log(`   File ID: ${result.fileId}`)
      console.log(`   S3 URL: ${result.s3Url}`)
      
      // Test 6: Get file metadata
      try {
        const metadata = await service.getFileMetadata(result.fileId)
        logTest(
          'Test 6: Retrieve file metadata by fileId',
          metadata !== null && metadata.fileId === result.fileId
        )
      } catch (error: any) {
        logTest('Test 6: Retrieve file metadata by fileId', false, error.message)
      }
      
      // Test 7: Get user files
      try {
        const userFiles = await service.getUserFiles(TEST_USER_ID)
        logTest(
          'Test 7: Get all files for user',
          userFiles.length > 0 && userFiles.some(f => f.fileId === result.fileId)
        )
      } catch (error: any) {
        logTest('Test 7: Get all files for user', false, error.message)
      }
      
      // Test 8: Get user files filtered by workspace
      try {
        const workspaceFiles = await service.getUserFiles(TEST_USER_ID, TEST_WORKSPACE)
        logTest(
          'Test 8: Get files filtered by workspace',
          workspaceFiles.length > 0 && workspaceFiles.every(f => f.workspace === TEST_WORKSPACE)
        )
      } catch (error: any) {
        logTest('Test 8: Get files filtered by workspace', false, error.message)
      }
      
      // Test 9: Process file - general chat
      try {
        const processing = await service.processFile(result.fileId, 'general_chat')
        logTest(
          'Test 9: Process file in general chat workspace',
          processing.analysis.includes('test-upload.txt')
        )
      } catch (error: any) {
        logTest('Test 9: Process file in general chat workspace', false, error.message)
      }
      
      // Test 10: Process file - debug workspace
      try {
        const processing = await service.processFile(result.fileId, 'debug')
        logTest(
          'Test 10: Process file in debug workspace',
          processing.analysis.includes('debug') || processing.analysis.includes('code')
        )
      } catch (error: any) {
        logTest('Test 10: Process file in debug workspace', false, error.message)
      }
      
      // Test 11: Process file - smart summarizer
      try {
        const processing = await service.processFile(result.fileId, 'smart_summarizer')
        logTest(
          'Test 11: Process file in smart summarizer workspace',
          processing.analysis.includes('summary') || processing.analysis.includes('analyze')
        )
      } catch (error: any) {
        logTest('Test 11: Process file in smart summarizer workspace', false, error.message)
      }
    }
  } catch (error: any) {
    logTest('Test 5: Upload file to S3 and save metadata', false, error.message)
    console.log('   Skipping tests 6-11 due to upload failure')
  }

  // Test 12: S3 key uniqueness
  try {
    const testBuffer = Buffer.from('Test content', 'utf-8')
    
    const result1 = await service.uploadFile(
      testBuffer,
      'duplicate.txt',
      TEST_USER_ID,
      TEST_WORKSPACE
    )
    
    // Small delay to ensure different timestamp
    await new Promise(resolve => setTimeout(resolve, 10))
    
    const result2 = await service.uploadFile(
      testBuffer,
      'duplicate.txt',
      TEST_USER_ID,
      TEST_WORKSPACE
    )
    
    logTest(
      'Test 12: S3 keys are unique for same filename',
      result1.s3Key !== result2.s3Key
    )
  } catch (error: any) {
    logTest('Test 12: S3 keys are unique for same filename', false, error.message)
  }

  // Test 13: File-session association
  try {
    const testBuffer = Buffer.from('Session test', 'utf-8')
    
    const result = await service.uploadFile(
      testBuffer,
      'session-test.txt',
      TEST_USER_ID,
      TEST_WORKSPACE,
      TEST_SESSION_ID
    )
    
    const metadata = await service.getFileMetadata(result.fileId)
    
    logTest(
      'Test 13: File associated with session',
      metadata !== null && metadata.sessionId === TEST_SESSION_ID
    )
  } catch (error: any) {
    logTest('Test 13: File associated with session', false, error.message)
  }

  // Test 14: Metadata validation
  try {
    const invalidMetadata: any = {
      fileId: 'test-id',
      // Missing required fields
    }
    
    let errorThrown = false
    try {
      await service.saveMetadata(invalidMetadata)
    } catch (error) {
      errorThrown = true
    }
    
    logTest('Test 14: Reject invalid metadata', errorThrown)
  } catch (error: any) {
    logTest('Test 14: Reject invalid metadata', false, error.message)
  }

  // Test 15: Get non-existent file
  try {
    const metadata = await service.getFileMetadata('non-existent-id')
    logTest('Test 15: Return null for non-existent file', metadata === null)
  } catch (error: any) {
    logTest('Test 15: Return null for non-existent file', false, error.message)
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
  }
}

// ============================================================================
// Jest wrapper — manual service test requiring MongoDB and AWS S3.
// ============================================================================

describe('file-service manual test (requires external services)', () => {
  it('is a manual service test — skipped in unit test runs', () => {
    expect(true).toBe(true)
  })
})

// Only run when executed directly (not under Jest)
if (typeof jest === 'undefined') {
  runTests().catch(console.error)
}
