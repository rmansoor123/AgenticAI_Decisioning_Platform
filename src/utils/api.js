/**
 * Safe JSON parsing for fetch responses.
 * Handles empty bodies, HTML error pages, and non-JSON responses
 * that occur when the backend is unreachable or returns errors.
 */
export async function safeJson(response) {
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(
      response.ok
        ? 'Server returned invalid response'
        : `Server error (${response.status}): ${text.slice(0, 200) || 'No response — is the backend running on port 3001?'}`
    )
  }
}
