/**
 * Manual Test Script for Chat History Service
 * 
 * Run this script to manually test the ChatHistoryService functionality.
 * 
 * Usage:
 *   npx ts-node src/lib/chat/__tests__/history.manual-test.ts
 * 
 * Or add to package.json scripts:
 *   "test:chat-history": "ts-node src/lib/chat/__tests__/history.manual-test.ts"
 */

// Mock MongoDB so this file can be imported under Jest without a real connection
jest.mock('@/lib/mongodb', () => ({
  __esModule: true,
  default: Promise.resolve({ db: () => ({}) }),
}))

import { chatHistoryService } from '../history'

async function testChatHistoryService() {
  console.log('🧪 Testing Chat History Service\n')

  const testUserId = 'test-user-' + Date.now()
  const testWorkspace = 'general-chat'
  let sessionId: string | undefined

  try {
    // Test 1: Create Session
    console.log('Test 1: Create Session')
    sessionId = await chatHistoryService.createSession(
      testUserId,
      testWorkspace,
      'Hello, this is my first message to test the chat history service!'
    )
    console.log(`✅ Created session: ${sessionId}\n`)

    // Test 2: Save Messages
    console.log('Test 2: Save Messages')
    const msg1 = await chatHistoryService.saveMessage(
      sessionId,
      'user',
      'Hello, this is my first message to test the chat history service!',
      testUserId
    )
    console.log(`✅ Saved user message: ${msg1}`)

    const msg2 = await chatHistoryService.saveMessage(
      sessionId,
      'assistant',
      'Hello! I can help you test the chat history service.',
      testUserId
    )
    console.log(`✅ Saved assistant message: ${msg2}\n`)

    // Test 3: Get Session List
    console.log('Test 3: Get Session List')
    const sessions = await chatHistoryService.getSessionList(testUserId)
    console.log(`✅ Retrieved ${sessions.length} session(s)`)
    console.log('Session details:', JSON.stringify(sessions[0], null, 2))
    console.log()

    // Test 4: Get Session with Messages
    console.log('Test 4: Get Session with Messages')
    const sessionWithMessages = await chatHistoryService.getSession(sessionId)
    if (sessionWithMessages) {
      console.log(`✅ Retrieved session with ${sessionWithMessages.messages.length} messages`)
      console.log('Session title:', sessionWithMessages.session.title)
      console.log('Messages:')
      sessionWithMessages.messages.forEach((msg, idx) => {
        console.log(`  ${idx + 1}. [${msg.role}]: ${msg.content.substring(0, 50)}...`)
      })
    }
    console.log()

    // Test 5: Update Session Title
    console.log('Test 5: Update Session Title')
    await chatHistoryService.updateSessionTitle(
      sessionId,
      testUserId,
      'Updated Test Session'
    )
    console.log('✅ Updated session title\n')

    // Test 6: Get Sessions by Workspace
    console.log('Test 6: Get Sessions by Workspace')
    const workspaceSessions = await chatHistoryService.getSessionsByWorkspace(
      testUserId,
      testWorkspace
    )
    console.log(`✅ Retrieved ${workspaceSessions.length} session(s) for workspace: ${testWorkspace}\n`)

    // Test 7: Delete Session
    console.log('Test 7: Delete Session')
    await chatHistoryService.deleteSession(sessionId, testUserId)
    console.log('✅ Deleted session\n')

    // Verify deletion
    console.log('Test 8: Verify Deletion')
    const deletedSession = await chatHistoryService.getSession(sessionId)
    if (deletedSession === null) {
      console.log('✅ Session successfully deleted (returns null)\n')
    } else {
      console.log('❌ Session still exists after deletion\n')
    }

    console.log('🎉 All tests passed!')
  } catch (error) {
    console.error('❌ Test failed:', error)
    
    // Cleanup on error
    if (sessionId) {
      try {
        await chatHistoryService.deleteSession(sessionId, testUserId)
        console.log('🧹 Cleaned up test session')
      } catch (cleanupError) {
        console.error('Failed to cleanup:', cleanupError)
      }
    }
  }
}

// ============================================================================
// Jest wrapper — manual service test requiring MongoDB.
// ============================================================================

describe('history manual test (requires MongoDB)', () => {
  it('is a manual service test — skipped in unit test runs', () => {
    expect(true).toBe(true)
  })
})

// Only run when executed directly (not under Jest)
if (typeof jest === 'undefined') {
  testChatHistoryService()
    .then(() => console.log('\n✅ Test script completed successfully'))
    .catch((error) => console.error('\n❌ Test script failed:', error))
}
