/**
 * Manual Test Script for Workspace Guard
 * 
 * Tests workspace behavior enforcement and intent detection
 * 
 * Usage:
 *   npx ts-node src/lib/ai/__tests__/workspace-guard.manual-test.ts
 */

import { workspaceGuard, WorkspaceType } from '../workspace-guard'

function testWorkspaceGuard() {
  console.log('🧪 Testing Workspace Guard\n')

  let testsPassed = 0
  let testsFailed = 0

  function runTest(
    testName: string,
    message: string,
    workspace: WorkspaceType,
    expectedAllowed: boolean,
    expectedSuggestedWorkspace?: WorkspaceType
  ) {
    console.log(`Test: ${testName}`)
    console.log(`  Message: "${message}"`)
    console.log(`  Workspace: ${workspace}`)
    
    const result = workspaceGuard.checkMessage(message, workspace)
    
    console.log(`  Result: ${result.allowed ? 'ALLOWED' : 'BLOCKED'}`)
    if (result.message) {
      console.log(`  Message: "${result.message}"`)
    }
    if (result.suggestedWorkspace) {
      console.log(`  Suggested: ${result.suggestedWorkspace}`)
    }
    
    const passed = result.allowed === expectedAllowed &&
      (!expectedSuggestedWorkspace || result.suggestedWorkspace === expectedSuggestedWorkspace)
    
    if (passed) {
      console.log('  ✅ PASS\n')
      testsPassed++
    } else {
      console.log('  ❌ FAIL\n')
      testsFailed++
    }
  }

  // Test 1: Debugging in General Chat (should be blocked)
  runTest(
    'Debugging in General Chat',
    'Can you help me debug this code? It has an error.',
    'general-chat',
    false,
    'debug-workspace'
  )

  // Test 2: General conversation in General Chat (should be allowed)
  runTest(
    'General conversation in General Chat',
    'Hello! How are you today?',
    'general-chat',
    true
  )

  // Test 3: Debugging in Debug Workspace (should be allowed)
  runTest(
    'Debugging in Debug Workspace',
    'Can you help me debug this code? It has an error.',
    'debug-workspace',
    true
  )

  // Test 4: General chat in Smart Summarizer (should be blocked)
  runTest(
    'General chat in Smart Summarizer',
    'Hello! How are you today?',
    'smart-summarizer',
    false,
    'general-chat'
  )

  // Test 5: Summarization in Smart Summarizer (should be allowed)
  runTest(
    'Summarization in Smart Summarizer',
    'Please summarize this document for me.',
    'smart-summarizer',
    true
  )

  // Test 6: Code execution in Explain Assist (should be blocked)
  runTest(
    'Code execution in Explain Assist',
    'Can you run this code for me?',
    'explain-assist',
    false,
    'debug-workspace'
  )

  // Test 7: Explanation in Explain Assist (should be allowed)
  runTest(
    'Explanation in Explain Assist',
    'Can you explain how recursion works?',
    'explain-assist',
    true
  )

  // Test 8: Summarization in General Chat (should be blocked)
  runTest(
    'Summarization in General Chat',
    'Please give me a tldr of this article.',
    'general-chat',
    false,
    'smart-summarizer'
  )

  // Test 9: No clear intent (should be allowed)
  runTest(
    'No clear intent',
    'What do you think about this?',
    'general-chat',
    true
  )

  // Test 10: Multiple intents - debugging (should be blocked in general-chat)
  runTest(
    'Multiple intents with debugging',
    'Hello! Can you help me fix this bug in my code?',
    'general-chat',
    false,
    'debug-workspace'
  )

  // Test 11: Code analysis in Code Reviewer (should be allowed)
  runTest(
    'Code analysis in Code Reviewer',
    'Can you review this code and suggest improvements?',
    'code-reviewer',
    true
  )

  // Test 12: Data analysis in Data Analyst (should be allowed)
  runTest(
    'Data analysis in Data Analyst',
    'Can you analyze this dataset and provide insights?',
    'data-analyst',
    true
  )

  // Test 13: Creative writing in Creative Writer (should be allowed)
  runTest(
    'Creative writing in Creative Writer',
    'Write a story about a space adventure.',
    'creative-writer',
    true
  )

  // Test 14: Debugging in Creative Writer (should be blocked)
  runTest(
    'Debugging in Creative Writer',
    'Can you debug this code?',
    'creative-writer',
    false,
    'debug-workspace'
  )

  // Test 15: Unknown workspace (should allow by default)
  runTest(
    'Unknown workspace fallback',
    'Hello!',
    'unknown-workspace' as WorkspaceType,
    true
  )

  // Summary
  console.log('='.repeat(50))
  console.log('Summary:')
  console.log(`✅ Passed: ${testsPassed}`)
  console.log(`❌ Failed: ${testsFailed}`)
  console.log('='.repeat(50))

  if (testsFailed === 0) {
    console.log('\n🎉 All tests passed!')
  } else {
    console.log('\n❌ Some tests failed')
  }
}

// Test workspace rules
function testWorkspaceRules() {
  console.log('\n📋 Testing Workspace Rules\n')

  const allRules = workspaceGuard.getAllRules()
  
  console.log(`Total workspaces: ${allRules.size}\n`)

  allRules.forEach((rule, workspace) => {
    console.log(`Workspace: ${workspace}`)
    console.log(`  Description: ${rule.description}`)
    console.log(`  Allowed: ${rule.allowedActions.join(', ')}`)
    console.log(`  Restricted: ${rule.restrictedActions.join(', ')}`)
    console.log()
  })
}

// ============================================================================
// Jest wrapper — manual workspace guard test.
// ============================================================================

describe('workspace-guard manual test', () => {
  it('is a manual test script — skipped in unit test runs', () => {
    expect(true).toBe(true)
  })
})

// Only run when executed directly (not under Jest)
if (typeof jest === 'undefined') {
  console.log('🚀 Starting Workspace Guard Tests\n')
  testWorkspaceRules()
  testWorkspaceGuard()
}
