# TELE-011: Teleloop Voice-to-Task (Audio Notes)

## Goal

Enable Telegram users to create tasks by sending voice notes. The bot will transcribe audio using an AI transcription service (OpenAI Whisper API) and parse the intent to create tasks automatically, providing a hands-free task creation experience.

## Background

The current Telegram bot (`packages/telegram`) supports text-based task creation through conversational flow and `/new` command. Users draft tasks via text messages in a state machine (IDLE → DRAFTING_TASK → CONFIRM_TASK). The bot integrates with any TaskBackend implementation for task persistence.

**Gap**: Users cannot create tasks via voice notes, which limits mobile/hands-free usage.

## Requirements

### Functional Requirements

1. **Voice Message Detection**
   - Bot must detect voice messages in Telegram updates
   - Support both `voice` (voice note) and `audio` (audio file) message types
   - Ignore other media types (photo, video, document) for this task

2. **Audio Download**
   - Download voice/audio file from Telegram servers using Bot API
   - Use `getFile` endpoint with `file_id` from message
   - Download file to temporary location (`.loopwork/tmp/voice/`)
   - Clean up temp files after transcription completes

3. **Transcription Service Integration**
   - Use OpenAI Whisper API for speech-to-text transcription
   - API endpoint: `https://api.openai.com/v1/audio/transcriptions`
   - Model: `whisper-1`
   - Language: Auto-detect (or default to English)
   - Return plain text transcript

4. **Intent Parsing & Task Creation**
   - Treat transcript as if user typed the text
   - Feed into existing task creation flow (same as text-based `/new`)
   - Support natural language task descriptions
   - Allow priority keywords: "urgent", "high priority", "low priority"
   - Example: "Urgent: fix the login bug on mobile" → priority=high, title="fix the login bug on mobile"

5. **User Feedback**
   - Show transcript to user before creating task: "🎤 Transcript: [text]\n\nCreating task..."
   - Display success message with task ID
   - Handle transcription errors gracefully: "⚠️ Could not transcribe audio. Please try again."

6. **Session State Integration**
   - Voice messages in IDLE state → auto-create task from transcript
   - Voice messages during DRAFTING_TASK state → append transcript to draft description
   - Voice messages during CONFIRM_TASK state → ignore (require text "yes/no")

7. **Configuration**
   - Add `whisperApiKey` to Telegram bot config (required for voice feature)
   - Add `enableVoiceNotes` boolean flag (default: true if API key provided)
   - Optional: `whisperModel` (default: "whisper-1"), `whisperLanguage` (default: auto)

### Non-Functional Requirements

1. **Error Handling**
   - Network failures during download → retry once, then fail gracefully
   - Transcription API errors → log error, notify user, don't crash bot
   - Empty transcript → ask user to try again

2. **Security**
   - Validate file size limits (Telegram voice notes max 20MB)
   - Sanitize transcript before task creation (prevent injection)
   - Store API key securely (environment variable)

3. **Performance**
   - Transcription should complete within 30 seconds for typical voice notes (<1 min audio)
   - Use async/await to prevent blocking other bot updates
   - Clean up temp files immediately after processing

4. **Testing**
   - Unit tests: Mock Telegram API and Whisper API responses
   - Integration test: Mock full flow (voice message → download → transcribe → task created)
   - E2E test: Use pre-recorded audio file, verify task appears in backend

## Architecture

### Data Flow

```
Telegram voice message
  ↓
TelegramUpdate.message.voice.file_id
  ↓
handleVoiceMessage(session, voiceFileId, duration)
  ↓
downloadVoiceFile(fileId) → /tmp/voice/{fileId}.ogg
  ↓
transcribeAudio(filePath) → Whisper API → transcript text
  ↓
parseTranscriptIntent(transcript) → { title, description, priority }
  ↓
startTaskDraft(session, parsedIntent) [existing flow]
  ↓
backend.createTask() [existing flow]
  ↓
User notification: "✅ Task TASK-XXX created from voice note"
```

### Integration Points

1. **TelegramUpdate Interface Extension**
   - Add `voice?: { file_id: string, duration: number, mime_type?: string }` to `TelegramUpdate.message`
   - Add `audio?: { file_id: string, duration: number, title?: string }` (optional, for future)

2. **Handler Method Additions** (in `TelegramTaskBot`)
   - `handleVoiceMessage(session, voiceFileId, duration): Promise<void>`
   - `downloadVoiceFile(fileId): Promise<string>` (returns local file path)
   - `transcribeAudio(filePath): Promise<string>` (returns transcript)
   - `parseTranscriptIntent(transcript): { title: string, description: string, priority?: string }`

3. **Message Routing Update** (in `handleUpdate()`)
   - Remove early return for non-text messages
   - Add voice message branch:
     ```typescript
     if (update.message?.voice) {
       await this.handleVoiceMessage(session, update.message.voice.file_id, update.message.voice.duration)
       return
     }
     ```

4. **External API Integration**
   - Telegram Bot API: `https://api.telegram.org/bot{token}/getFile?file_id={file_id}`
   - Telegram File Download: `https://api.telegram.org/file/bot{token}/{file_path}`
   - OpenAI Whisper API: `POST https://api.openai.com/v1/audio/transcriptions`

### Configuration Schema

```typescript
export interface TelegramBotOptions {
  botToken: string
  allowedChatIds?: number[]
  whisperApiKey?: string        // NEW: Required for voice feature
  enableVoiceNotes?: boolean    // NEW: Default true if whisperApiKey present
  whisperModel?: string         // NEW: Default "whisper-1"
  whisperLanguage?: string      // NEW: Default auto-detect
  // ... existing fields
}
```

## Implementation Plan

### Phase 1: Type Definitions & Message Routing (1 file change)
- File: `packages/telegram/src/bot.ts`
- Add voice/audio fields to `TelegramUpdate` interface
- Modify `handleUpdate()` to route voice messages
- Add stub `handleVoiceMessage()` that logs receipt

### Phase 2: Telegram File Download (1 new method)
- File: `packages/telegram/src/bot.ts`
- Implement `downloadVoiceFile(fileId)`
- Use `fetch` to call Telegram `getFile` and download endpoints
- Save to `.loopwork/tmp/voice/{fileId}.ogg`
- Return local file path

### Phase 3: Whisper API Integration (1 new method)
- File: `packages/telegram/src/bot.ts`
- Implement `transcribeAudio(filePath)`
- Use `FormData` to upload audio file to Whisper API
- Parse JSON response and extract `text` field
- Handle API errors (rate limit, authentication, network)

### Phase 4: Intent Parsing & Task Creation (1 new method + integration)
- File: `packages/telegram/src/bot.ts`
- Implement `parseTranscriptIntent(transcript)`
- Detect priority keywords ("urgent", "high", "low")
- Extract title and description from transcript
- Connect to existing `startTaskDraft()` flow

### Phase 5: Testing
- File: `packages/telegram/test/voice-to-task.test.ts` (new)
- Mock Telegram API responses (getFile, file download)
- Mock Whisper API responses (transcription)
- Mock backend.createTask
- Test cases:
  1. Happy path: voice → transcript → task created
  2. Download failure → retry → user notified
  3. Transcription failure → error handling
  4. Empty transcript → user prompted to retry
  5. Priority keyword detection ("urgent" → priority=high)
  6. Session state handling (IDLE vs DRAFTING_TASK)

## Success Criteria

1. **Functional Tests Pass**
   - Integration test: Mock voice message → task created in backend
   - E2E test: Real audio file → transcribed → task verified in tasks.json

2. **Type Safety**
   - No TypeScript errors in `packages/telegram/`
   - `TelegramUpdate` interface correctly extends for voice messages

3. **Error Handling**
   - Bot doesn't crash on malformed voice messages
   - User receives helpful error messages on failures
   - Temp files cleaned up even on errors

4. **Performance**
   - Voice notes (<1 min) transcribed in <30 seconds
   - Bot remains responsive during transcription (async handling)

5. **Documentation**
   - README updated with voice feature setup instructions
   - Config options documented (whisperApiKey, enableVoiceNotes)
   - Example usage added to docs

## Out of Scope

1. **Speaker Diarization**: Multiple speakers in audio not distinguished
2. **Audio Formats**: Only Telegram-supported formats (OGG, MP3)
3. **Long Audio**: Voice notes >5 minutes not optimized (may timeout)
4. **Language Selection UI**: User can't choose transcription language (auto-detect only)
5. **Transcript Editing**: User can't edit transcript before task creation (future enhancement)

## Dependencies

- OpenAI API account with Whisper API access
- Sufficient API quota for expected voice message volume
- Telegram Bot API v6.0+ (for voice message support)

## Security Considerations

1. **API Key Storage**: `whisperApiKey` must be in environment variable, not committed to repo
2. **File Cleanup**: Temp audio files deleted after transcription to prevent disk filling
3. **Input Sanitization**: Transcript text sanitized before task creation
4. **Rate Limiting**: Consider rate limiting voice messages per user (future enhancement)

## Metrics for Success

1. **Adoption**: % of tasks created via voice vs text (target: >10% after 1 month)
2. **Accuracy**: Transcription accuracy (target: >95% for English)
3. **Completion Rate**: % of voice messages successfully converted to tasks (target: >90%)
4. **Error Rate**: Transcription failures (target: <5%)

## Future Enhancements (Not in Scope)

1. Allow user to edit transcript before confirming task creation
2. Support multiple languages with user-selected language
3. Store original voice note as attachment to task metadata
4. Add voice commands: "mark TASK-001 as complete" (voice-based task management)
5. Summarize long audio into concise task descriptions
