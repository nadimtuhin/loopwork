# TELE-012: Teleloop - 'Vision' Bug Reporting

## Goal
Enable users to report bugs by sending images through Telegram. The bot should save the image to `.specs/attachments` and create a task referencing it for multimodal AI analysis.

## Requirements

### Image Handling
- Detect when a user sends an image (photo) in Telegram
- Download the image file from Telegram servers
- Save the image to `.specs/attachments/{timestamp}-{filename}.{ext}`
- Generate a unique filename using timestamp to prevent collisions

### Task Creation
- Create a new task in the backend with:
  - Title: "Bug Report: [user caption or timestamp]"
  - Description including the image reference path
  - Feature tag: "bug-report" or "teleloop"
  - Status: "pending"
  - Priority: "medium" (or allow user to specify)

### Task Metadata
- Store the image path in task metadata for AI reference
- Include any caption/text the user sent with the image
- Optionally include user information (Telegram user ID, username)

### User Feedback
- Send confirmation message to Telegram with:
  - Task ID created
  - Link to the saved image (local path)
  - Confirmation that it's queued for processing

## Integration Data Flow

```
Telegram image upload
  → bot.on('photo') handler
  → telegram.getFileLink(fileId)
  → download image to .specs/attachments/
  → backend.createTask({ metadata: { imagePath, caption } })
  → send confirmation to user
```

## Testing

### Unit Tests
- Test image download and saving logic
- Test task creation with image metadata
- Test filename generation and collision handling

### Integration Tests
- Mock Telegram photo message
- Verify file saved to correct location
- Verify task created with correct metadata
- Verify confirmation message sent

## Success Criteria
- Images are successfully downloaded and saved
- Tasks are created with proper image references
- Users receive confirmation
- File paths are correctly stored in task metadata
- AI tools can read the image path from task metadata

## Implementation Notes
- Use `node-telegram-bot-api` file download methods
- Ensure `.specs/attachments` directory exists (create if needed)
- Handle file size limits (Telegram photo size)
- Handle errors gracefully (download failures, disk space)
- Consider image format support (JPEG, PNG, WebP)
