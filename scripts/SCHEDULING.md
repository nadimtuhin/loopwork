# LinkedIn Post Scheduling Guide

## Option 1: Buffer CLI Script (Requires API Access)

**Note**: Buffer [no longer supports creating new developer apps](https://buffer.com/developer-api), so this only works if you already have API access.

### Setup

1. Get your Buffer credentials:
   ```bash
   # Get profiles (you need this to find your LinkedIn profile ID)
   curl https://api.bufferapp.com/1/profiles.json?access_token=YOUR_TOKEN
   ```

2. Set environment variables:
   ```bash
   export BUFFER_ACCESS_TOKEN="your_access_token_here"
   export BUFFER_PROFILE_ID="your_linkedin_profile_id"
   ```

3. Preview schedule (dry run):
   ```bash
   bun run scripts/schedule-linkedin-posts.ts --dry-run
   ```

4. Schedule for real:
   ```bash
   bun run scripts/schedule-linkedin-posts.ts
   ```

The script schedules posts for next Monday, Wednesday, Friday at 9:00 AM.

---

## Option 2: Zapier/Make.com (Recommended Alternative)

Since Buffer API is restricted, use automation platforms:

### Using Zapier

1. Create a Google Sheet with columns:
   - `date` - When to post (e.g., "2026-02-03 09:00")
   - `content` - Post text
   - `status` - "pending"

2. Create Zapier flow:
   - Trigger: **New row in Google Sheets**
   - Filter: Only if status = "pending"
   - Action: **Create Buffer post**
   - Action: **Update sheet row** (set status = "scheduled")

3. Paste the 3 posts into the sheet with desired dates

### Using Make.com

Similar setup with better free tier (1000 operations/month vs Zapier's 100).

---

## Option 3: Manual CSV Import to Buffer

Buffer supports CSV imports for bulk scheduling:

1. Create `posts.csv`:
   ```csv
   profile,text,scheduled_at
   linkedin,"Post 1 content here","2026-02-03 09:00"
   linkedin,"Post 2 content here","2026-02-05 09:00"
   linkedin,"Post 3 content here","2026-02-07 09:00"
   ```

2. Go to Buffer → Settings → Import
3. Upload CSV

---

## Option 4: Direct API (cURL)

If you have Buffer API access:

```bash
# Post 1 - Monday
curl -X POST https://api.bufferapp.com/1/updates/create.json \
  -H "Authorization: Bearer $BUFFER_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "profile_ids": ["'"$BUFFER_PROFILE_ID"'"],
    "text": "I got tired of babysitting Claude...",
    "scheduled_at": 1738580400
  }'
```

Calculate Unix timestamp:
```bash
date -j -f "%Y-%m-%d %H:%M" "2026-02-03 09:00" +%s
```

---

## Option 5: Typefully (Alternative to Buffer)

[Typefully](https://typefully.com) has a better API story and supports:
- CLI scheduling
- Markdown support
- Thread composer
- Auto-scheduling with queue

**Setup with Typefully:**

```bash
# Install CLI
npm install -g typefully-cli

# Authenticate
typefully auth

# Schedule post
typefully publish \
  --text "Post content here" \
  --schedule "2026-02-03 09:00" \
  --platform linkedin
```

---

## Recommended Approach

Given Buffer's API restrictions:

1. **For one-time use**: Copy/paste into Buffer web UI (5 minutes)
2. **For automation**: Use Typefully CLI or API
3. **For team workflows**: Zapier/Make.com + Google Sheets

The CLI script I created will work if you have legacy Buffer API access, but for new users, Typefully or manual scheduling is more practical.

---

## References

- [Buffer API Documentation](https://buffer.com/developers/api)
- [Buffer Authentication](https://buffer.com/developers/api/oauth)
- [Python Buffer API Guide](https://www.omi.me/blogs/api-guides/how-to-schedule-social-media-posts-using-buffer-api-in-python)
- [Buffer API Developer Guide](https://getlate.dev/blog/buffer-api)
