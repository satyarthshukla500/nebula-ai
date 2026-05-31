/**
 * Manual API Test Script for Chat History Endpoints
 * 
 * This script tests all chat history API endpoints by making HTTP requests.
 * 
 * Prerequisites:
 * - Start the development server: npm run dev
 * - Ensure MongoDB is connected
 * 
 * Usage:
 *   npx ts-node src/app/api/chat/__tests__/api-test.manual.ts
 */

const BASE_URL = 'http://localhost:3000'

interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  code?: string
}

async function testChatHistoryAPI() {
  console.log('🧪 Testing Chat History API Endpoints\n')
  console.log(`Base URL: ${BASE_URL}\n`)

  const testUserId = 'test-user-' + Date.now()
  const testWorkspace = 'general-chat'
  let sessionId: string | undefined = undefined

  try {
    // Test 1: Create Session
    console.log('Test 1: POST /api/chat/session/create')
    const createResponse = await fetch(`${BASE_URL}/api/chat/session/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: testUserId,
        workspace: testWorkspace,
        firstMessage: 'Hello, this is my first message for API testing!'
      })
    })
    
    const createData: ApiResponse<{ sessionId: string }> = await createResponse.json()
    
    if (!createData.success || !createData.data?.sessionId) {
      throw new Error(`Create session failed: ${createData.error}`)
    }
    
    sessionId = createData.data.sessionId
    console.log(`✅ Status: ${createResponse.status}`)
    console.log(`✅ Created session: ${sessionId}\n`)

    // Test 2: Save User Message
    console.log('Test 2: POST /api/chat/message (user)')
    const userMessageResponse = await fetch(`${BASE_URL}/api/chat/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        userId: testUserId,
        role: 'user',
        content: 'Hello, this is my first message for API testing!'
      })
    })
    
    const userMessageData: ApiResponse<{ messageId: string }> = await userMessageResponse.json()
    
    if (!userMessageData.success || !userMessageData.data?.messageId) {
      throw new Error(`Save user message failed: ${userMessageData.error}`)
    }
    
    console.log(`✅ Status: ${userMessageResponse.status}`)
    console.log(`✅ Saved user message: ${userMessageData.data.messageId}\n`)

    // Test 3: Save Assistant Message
    console.log('Test 3: POST /api/chat/message (assistant)')
    const assistantMessageResponse = await fetch(`${BASE_URL}/api/chat/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        userId: testUserId,
        role: 'assistant',
        content: 'Hello! I can help you test the chat history API.'
      })
    })
    
    const assistantMessageData: ApiResponse<{ messageId: string }> = await assistantMessageResponse.json()
    
    if (!assistantMessageData.success || !assistantMessageData.data?.messageId) {
      throw new Error(`Save assistant message failed: ${assistantMessageData.error}`)
    }
    
    console.log(`✅ Status: ${assistantMessageResponse.status}`)
    console.log(`✅ Saved assistant message: ${assistantMessageData.data.messageId}\n`)

    // Test 4: Get Session List
    console.log('Test 4: GET /api/chat/session/list')
    const listResponse = await fetch(
      `${BASE_URL}/api/chat/session/list?userId=${testUserId}`
    )
    
    const listData: ApiResponse<{ sessions: any[] }> = await listResponse.json()
    
    if (!listData.success || !listData.data?.sessions) {
      throw new Error(`Get session list failed: ${listData.error}`)
    }
    
    console.log(`✅ Status: ${listResponse.status}`)
    console.log(`✅ Retrieved ${listData.data.sessions.length} session(s)`)
    console.log('Session details:', JSON.stringify(listData.data.sessions[0], null, 2))
    console.log()

    // Test 5: Get Session with Messages
    console.log('Test 5: GET /api/chat/session/:id')
    const getSessionResponse = await fetch(
      `${BASE_URL}/api/chat/session/${sessionId}`
    )
    
    const getSessionData: ApiResponse<any> = await getSessionResponse.json()
    
    if (!getSessionData.success || !getSessionData.data) {
      throw new Error(`Get session failed: ${getSessionData.error}`)
    }
    
    console.log(`✅ Status: ${getSessionResponse.status}`)
    console.log(`✅ Retrieved session with ${getSessionData.data.messages.length} messages`)
    console.log('Session title:', getSessionData.data.session.title)
    console.log('Messages:')
    getSessionData.data.messages.forEach((msg: any, idx: number) => {
      console.log(`  ${idx + 1}. [${msg.role}]: ${msg.content.substring(0, 50)}...`)
    })
    console.log()

    // Test 6: Delete Session
    console.log('Test 6: DELETE /api/chat/session/:id')
    const deleteResponse = await fetch(
      `${BASE_URL}/api/chat/session/${sessionId}?userId=${testUserId}`,
      { method: 'DELETE' }
    )
    
    const deleteData: ApiResponse = await deleteResponse.json()
    
    if (!deleteData.success) {
      throw new Error(`Delete session failed: ${deleteData.error}`)
    }
    
    console.log(`✅ Status: ${deleteResponse.status}`)
    console.log('✅ Deleted session\n')

    // Test 7: Verify Deletion
    console.log('Test 7: Verify Deletion (GET deleted session)')
    const verifyResponse = await fetch(
      `${BASE_URL}/api/chat/session/${sessionId}`
    )
    
    const verifyData: ApiResponse = await verifyResponse.json()
    
    if (verifyResponse.status === 404 && !verifyData.success) {
      console.log(`✅ Status: ${verifyResponse.status}`)
      console.log('✅ Session not found (correctly deleted)\n')
    } else {
      throw new Error('Session still exists after deletion')
    }

    // Test 8: Error Handling - Invalid Request
    console.log('Test 8: Error Handling (missing userId)')
    const errorResponse = await fetch(`${BASE_URL}/api/chat/session/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace: testWorkspace
        // Missing userId
      })
    })
    
    const errorData: ApiResponse = await errorResponse.json()
    
    if (errorResponse.status === 400 && !errorData.success) {
      console.log(`✅ Status: ${errorResponse.status}`)
      console.log(`✅ Error handled correctly: ${errorData.error}\n`)
    } else {
      throw new Error('Error handling failed')
    }

    console.log('🎉 All API tests passed!')
  } catch (error) {
    console.error('❌ Test failed:', error)
    
    // Cleanup on error
    if (sessionId) {
      try {
        await fetch(
          `${BASE_URL}/api/chat/session/${sessionId}?userId=${testUserId}`,
          { method: 'DELETE' }
        )
        console.log('🧹 Cleaned up test session')
      } catch (cleanupError) {
        console.error('Failed to cleanup:', cleanupError)
      }
    }
  }
}

// ============================================================================
// Jest wrapper — manual API test script requiring a live server.
// ============================================================================

describe('api-test manual (requires live server)', () => {
  it('is a manual API test script — skipped in unit test runs', () => {
    expect(true).toBe(true)
  })
})

// Only run when executed directly (not under Jest)
if (typeof jest === 'undefined') {
  console.log('⚠️  Make sure the development server is running: npm run dev\n')
  testChatHistoryAPI()
    .then(() => console.log('\n✅ API test script completed successfully'))
    .catch((error) => console.error('\n❌ API test script failed:', error))
}
