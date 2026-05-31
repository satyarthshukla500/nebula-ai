/**
 * Manual Integration Test for Workspace Guard
 * 
 * This script tests the workspace guard integration in the AI flow.
 * Run this after starting the dev server to verify guard functionality.
 * 
 * Usage:
 *   1. Start dev server: npm run dev
 *   2. Run this script: npx ts-node src/app/api/workspaces/__tests__/guard-integration.manual-test.ts
 */

const API_BASE_URL = 'http://localhost:3000'

interface TestCase {
  name: string
  workspace: string
  message: string
  shouldBlock: boolean
  expectedKeywords?: string[]
}

const testCases: TestCase[] = [
  // Test 1: Debugging in general-chat should be blocked
  {
    name: 'Debug in General Chat (should block)',
    workspace: 'general_chat',
    message: 'Debug this code for me',
    shouldBlock: true,
    expectedKeywords: ['Debug Workspace']
  },
  
  // Test 2: Debugging in debug-workspace should be allowed
  {
    name: 'Debug in Debug Workspace (should allow)',
    workspace: 'debug',
    message: 'Debug this code for me',
    shouldBlock: false
  },
  
  // Test 3: General chat in general-chat should be allowed
  {
    name: 'General Chat in General Chat (should allow)',
    workspace: 'general_chat',
    message: 'Hello, how are you?',
    shouldBlock: false
  },
  
  // Test 4: Summarization in general-chat should be blocked
  {
    name: 'Summarize in General Chat (should block)',
    workspace: 'general_chat',
    message: 'Summarize this text for me',
    shouldBlock: true,
    expectedKeywords: ['Smart Summarizer']
  },
  
  // Test 5: Summarization in smart-summarizer should be allowed
  {
    name: 'Summarize in Smart Summarizer (should allow)',
    workspace: 'smart_summarizer',
    message: 'Summarize this text for me',
    shouldBlock: false
  },
  
  // Test 6: Code execution in explain-assist should be blocked
  {
    name: 'Execute Code in Explain Assist (should block)',
    workspace: 'explain_assist',
    message: 'Run this code',
    shouldBlock: true,
    expectedKeywords: ['Debug Workspace']
  },
  
  // Test 7: Explanation in explain-assist should be allowed
  {
    name: 'Explain in Explain Assist (should allow)',
    workspace: 'explain_assist',
    message: 'Explain how recursion works',
    shouldBlock: false
  },
]

async function runTest(testCase: TestCase): Promise<boolean> {
  console.log(`\n🧪 Running: ${testCase.name}`)
  console.log(`   Workspace: ${testCase.workspace}`)
  console.log(`   Message: "${testCase.message}"`)
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/workspaces/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: testCase.message,
        workspaceType: testCase.workspace,
        conversationHistory: []
      })
    })
    
    const data = await response.json()
    
    if (!data.success) {
      console.log(`   ❌ API Error: ${data.error}`)
      return false
    }
    
    const hasGuardWarning = data.data.guardWarning === true
    const responseMessage = data.data.message
    const suggestedWorkspace = data.data.suggestedWorkspace
    
    // Check if guard behavior matches expectation
    if (testCase.shouldBlock) {
      if (!hasGuardWarning) {
        console.log(`   ❌ FAIL: Expected guard to block, but it didn't`)
        console.log(`   Response: ${responseMessage}`)
        return false
      }
      
      // Check if response contains expected keywords
      if (testCase.expectedKeywords) {
        const hasKeywords = testCase.expectedKeywords.some(keyword => 
          responseMessage.includes(keyword)
        )
        
        if (!hasKeywords) {
          console.log(`   ❌ FAIL: Response missing expected keywords: ${testCase.expectedKeywords.join(', ')}`)
          console.log(`   Response: ${responseMessage}`)
          return false
        }
      }
      
      console.log(`   ✅ PASS: Guard blocked correctly`)
      console.log(`   Message: ${responseMessage}`)
      if (suggestedWorkspace) {
        console.log(`   Suggested: ${suggestedWorkspace}`)
      }
      return true
      
    } else {
      if (hasGuardWarning) {
        console.log(`   ❌ FAIL: Expected guard to allow, but it blocked`)
        console.log(`   Response: ${responseMessage}`)
        return false
      }
      
      console.log(`   ✅ PASS: Guard allowed correctly`)
      console.log(`   Response: ${responseMessage.substring(0, 100)}...`)
      return true
    }
    
  } catch (error: any) {
    console.log(`   ❌ ERROR: ${error.message}`)
    return false
  }
}

async function runAllTests() {
  console.log('='.repeat(60))
  console.log('Workspace Guard Integration Tests')
  console.log('='.repeat(60))
  console.log(`\nTesting against: ${API_BASE_URL}`)
  console.log(`Total tests: ${testCases.length}`)
  
  let passed = 0
  let failed = 0
  
  for (const testCase of testCases) {
    const result = await runTest(testCase)
    if (result) {
      passed++
    } else {
      failed++
    }
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  
  console.log('\n' + '='.repeat(60))
  console.log('Test Results')
  console.log('='.repeat(60))
  console.log(`✅ Passed: ${passed}`)
  console.log(`❌ Failed: ${failed}`)
  console.log(`📊 Total: ${testCases.length}`)
  
  if (failed === 0) {
    console.log('\n🎉 All tests passed!')
  } else {
    console.log('\n⚠️  Some tests failed. Please review the output above.')
  }
}

// ============================================================================
// Jest wrapper — manual integration script requiring a live server.
// The runAllTests() call is skipped when running under Jest.
// ============================================================================

describe('guard-integration manual test (requires live server)', () => {
  it('is a manual integration script — skipped in unit test runs', () => {
    expect(true).toBe(true)
  })
})

// Only run the integration tests when executed directly (not under Jest)
if (typeof jest === 'undefined') {
  runAllTests().catch(console.error)
}
