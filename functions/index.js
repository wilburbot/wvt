const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const Anthropic = require('@anthropic-ai/sdk');

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');

// Cheaper alternatives if cost matters more than top capability for this
// use case: 'claude-sonnet-5' or 'claude-haiku-4-5'.
const MODEL = 'claude-opus-5';

// Builds the Claude request body from the callable's input. Pure/testable -
// no Firebase or network dependency, so it can be exercised directly.
function buildMessagesRequest({ reportBase64, reportMediaType, reportText, stats, eventName }) {
  if (!reportBase64 && !reportText) {
    throw new HttpsError('invalid-argument', 'Provide a scouting report file or pasted notes.');
  }
  if (!stats) {
    throw new HttpsError('invalid-argument', 'Missing current match stats.');
  }

  const content = [];
  if (reportBase64) {
    const mediaType = reportMediaType || 'application/pdf';
    if (mediaType.startsWith('image/')) {
      content.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: reportBase64 } });
    } else {
      content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: reportBase64 } });
    }
  }

  const promptParts = [
    `Match: ${eventName || 'Untitled event'}`,
    '',
    "Current live stats (from the team's stat-tracking dashboard):",
    '```json',
    JSON.stringify(stats, null, 2),
    '```',
  ];
  if (reportText) {
    promptParts.push('', 'Scouting notes (pasted text):', reportText);
  }
  promptParts.push(
    '',
    'Using the attached scouting report (if provided) and the live stats above, give the coaching staff:',
    '1. A short summary of what is happening in the match right now.',
    '2. 3-5 concrete, actionable in-game suggestions (rotations, matchups, serving/attacking targets) that connect the scouting report to what the stats are currently showing.',
    '3. Anything in the stats that contradicts or updates the scouting report.',
    '',
    'Keep it scannable for a coach reading this between rallies - short headers and bullet points, not long paragraphs.'
  );
  content.push({ type: 'text', text: promptParts.join('\n') });

  return {
    model: MODEL,
    max_tokens: 4096,
    system:
      'You are an assistant volleyball scouting analyst helping a coaching staff during a live match. Be concise, concrete, and specific to the data given. Never invent stats or scouting details that were not provided.',
    messages: [{ role: 'user', content }],
  };
}

// Calls Claude with an already-constructed client and maps errors to
// HttpsError. Pure/testable - takes the client as a parameter instead of
// constructing it, so tests can pass a stub.
async function callClaude(client, messagesRequest) {
  let response;
  try {
    response = await client.messages.create(messagesRequest);
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      throw new HttpsError(
        'failed-precondition',
        'The Claude API key is missing or invalid on the server. Run: firebase functions:secrets:set ANTHROPIC_API_KEY'
      );
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new HttpsError('resource-exhausted', 'Rate limited by Claude - try again in a moment.');
    }
    if (err instanceof Anthropic.APIError) {
      throw new HttpsError('internal', `Claude API error: ${err.message}`);
    }
    throw new HttpsError('internal', `Unexpected error calling Claude: ${err.message || err}`);
  }

  if (response.stop_reason === 'refusal') {
    throw new HttpsError('failed-precondition', 'Claude declined to analyze this request.');
  }

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n\n');

  return {
    text,
    model: response.model,
    usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
  };
}

exports.analyzeScoutingReport = onCall(
  { secrets: [anthropicApiKey], cors: true, timeoutSeconds: 120, memory: '512MiB' },
  async (request) => {
    const messagesRequest = buildMessagesRequest(request.data || {});
    const client = new Anthropic({ apiKey: anthropicApiKey.value() });
    return callClaude(client, messagesRequest);
  }
);

// Exposed for local testing only (see functions/test-local.js) - not part
// of the deployed callable surface.
exports._internal = { buildMessagesRequest, callClaude };
