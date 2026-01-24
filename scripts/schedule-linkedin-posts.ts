#!/usr/bin/env bun

/**
 * Schedule LinkedIn posts to Buffer
 *
 * Usage:
 *   bun run scripts/schedule-linkedin-posts.ts
 *
 * Required env vars:
 *   BUFFER_ACCESS_TOKEN - Your Buffer API access token
 *   BUFFER_PROFILE_ID - Your LinkedIn profile ID from Buffer
 */

interface BufferPost {
  text: string
  profile_ids: string[]
  scheduled_at?: number
  now?: boolean
}

const POSTS = [
  {
    day: 1,
    title: "The Origin Story",
    content: `I got tired of babysitting Claude while it worked through my backlog.

Every morning, same ritual:
- Open Claude Code
- Copy/paste task from my list
- Wait for it to finish
- Update Todoist manually
- Check if I'm over budget
- Repeat 20 times

One day I snapped and asked: "Why am I the task router?"

So I built Loopwork.

Now Claude:
✅ Pulls tasks from my JSON backlog automatically
✅ Updates Todoist as it works
✅ Pings me on Telegram when done (or stuck)
✅ Tracks token usage and costs
✅ Stops before burning my daily API budget

All while I'm in meetings or doing actual architecture work.

The kicker? Plugin architecture means you can wire it to YOUR stack—Discord, custom backends, whatever you use.

v0.2.0 just dropped with \`loopwork init\` for easy setup.

Early days, but it's already saving me hours/week. Open source and free to try.

Tomorrow I'll share the technical architecture that makes this possible (it's pretty clean).

GitHub: https://github.com/nadimtuhin/loopwork

#AI #OpenSource #DeveloperTools #Automation #BuildInPublic #ProductivityHacks`,
  },
  {
    day: 3,
    title: "The Technical Deep Dive",
    content: `Building in public: How Loopwork's plugin architecture works

(Following up on Monday's post about automating AI task execution)

I wanted Loopwork to be extensible without becoming a monolith.

The solution? A Next.js-style composable config:

\`\`\`typescript
export default compose(
  withJSONBackend({ tasksFile: 'tasks.json' }),
  withTelegram({ notifyOnComplete: true }),
  withTodoist({ syncOnComplete: true }),
  withCostTracking({ dailyBudget: 10.00 }),
)(defineConfig({
  cli: 'claude',
  maxIterations: 50,
}))
\`\`\`

Each plugin hooks into the lifecycle:
- onTaskStart - Cost tracking begins
- onTaskComplete - Telegram notifies, Todoist syncs
- onTaskFailed - Discord pings, error logged
- onLoopEnd - Cost summary, metrics

The backend itself is a plugin. Swap JSON for custom backends with one line.

What I'm proud of:
🔌 Zero coupling between plugins
📦 Each plugin is ~200 lines
🧪 Fully testable in isolation
🔄 Plugin order doesn't matter
♻️ Plugins can be composed infinitely

New in v0.2.0:
- Interactive \`loopwork init\` scaffolding
- CLI architecture refactor
- Comprehensive E2E tests
- Better config precedence (CLI > env > config)

The pattern scales. I'm already seeing opportunities for:
- Custom LLM providers
- Database backends
- Linear integration
- Slack notifications

Next post: Where this is headed (spoiler: multiplayer mode 👀)

See Monday's post for the origin story, or jump straight to GitHub: https://github.com/nadimtuhin/loopwork

#SoftwareArchitecture #PluginArchitecture #TypeScript #OpenSource #DevTools #BuildInPublic`,
  },
  {
    day: 5,
    title: "The Vision",
    content: `The future of Loopwork: Autonomous dev teams

(Final post in this series - see comments for parts 1 & 2)

Started with a simple problem: Stop manually feeding tasks to Claude.

Now I'm seeing something bigger.

What's next:

🤝 Multiplayer Mode
Multiple AI agents working in parallel, different specialists:
- Frontend agent (React expert)
- Backend agent (API specialist)
- DevOps agent (deployment guru)
- Code review agent (quality gate)

All coordinated through Loopwork's plugin system.

🧠 Smart Task Distribution
ML-based task routing:
- Analyze task PRD
- Route to best-fit specialist
- Balance workload across agents
- Detect blockers before they happen

🔐 Enterprise Features
- Audit logs for compliance
- Cost allocation by team/project
- Approval workflows for production
- Team collaboration features

📊 Analytics Dashboard
- Velocity metrics per agent
- Cost per feature analysis
- Bottleneck detection
- Quality trends over time

Why this matters:

We're at the inflection point where AI coding assistants go from "helpful copilot" to "autonomous team member."

The blocker isn't AI capability—it's orchestration.

Loopwork is my bet on solving orchestration with:
- Open architecture (no vendor lock-in)
- Plugin ecosystem (community-driven)
- Simple primitives (anyone can extend)

This week's release (v0.2.0):
- Interactive setup: \`loopwork init\`
- Solid foundation for what's coming
- GitHub: https://github.com/nadimtuhin/loopwork

What would YOU build with autonomous AI agents?

Genuinely curious. The use cases I'm hearing are wild.

Drop your ideas below 👇

---

If you missed the earlier posts:
📌 Part 1: The problem and why I built this
📌 Part 2: Technical deep dive on plugin architecture

#FutureOfWork #AIAutomation #DevOps #EngineeringLeadership #BuildInPublic #OpenSource`,
  },
]

async function scheduleToBuffer() {
  const accessToken = process.env.BUFFER_ACCESS_TOKEN
  const profileId = process.env.BUFFER_PROFILE_ID

  if (!accessToken || !profileId) {
    console.error('❌ Missing required environment variables:')
    console.error('   BUFFER_ACCESS_TOKEN')
    console.error('   BUFFER_PROFILE_ID')
    console.error('\nGet your access token from: https://buffer.com/developers/api')
    console.error('Get your profile ID by calling: https://api.bufferapp.com/1/profiles.json')
    process.exit(1)
  }

  // Calculate schedule: Monday 9am, Wednesday 9am, Friday 9am
  const now = new Date()
  const nextMonday = new Date(now)
  nextMonday.setDate(now.getDate() + ((1 + 7 - now.getDay()) % 7 || 7))
  nextMonday.setHours(9, 0, 0, 0)

  console.log('📅 Scheduling posts to Buffer...\n')

  for (const post of POSTS) {
    const scheduleDate = new Date(nextMonday)
    scheduleDate.setDate(nextMonday.getDate() + (post.day - 1))

    const scheduledAt = Math.floor(scheduleDate.getTime() / 1000)

    const payload: BufferPost = {
      text: post.content,
      profile_ids: [profileId],
      scheduled_at: scheduledAt,
    }

    try {
      const response = await fetch('https://api.bufferapp.com/1/updates/create.json', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      })

      const data = await response.json()

      if (response.ok) {
        console.log(`✅ Day ${post.day} - "${post.title}"`)
        console.log(`   Scheduled for: ${scheduleDate.toLocaleString()}`)
        console.log(`   Buffer ID: ${data.id}\n`)
      } else {
        console.error(`❌ Day ${post.day} - "${post.title}"`)
        console.error(`   Error: ${data.message || JSON.stringify(data)}\n`)
      }
    } catch (error) {
      console.error(`❌ Day ${post.day} - "${post.title}"`)
      console.error(`   Network error: ${error}\n`)
    }
  }

  console.log('✨ Done!')
}

// Dry run mode to preview schedule
async function dryRun() {
  const now = new Date()
  const nextMonday = new Date(now)
  nextMonday.setDate(now.getDate() + ((1 + 7 - now.getDay()) % 7 || 7))
  nextMonday.setHours(9, 0, 0, 0)

  console.log('📅 DRY RUN - Posts would be scheduled as follows:\n')

  for (const post of POSTS) {
    const scheduleDate = new Date(nextMonday)
    scheduleDate.setDate(nextMonday.getDate() + (post.day - 1))

    console.log(`📌 Day ${post.day} - "${post.title}"`)
    console.log(`   ${scheduleDate.toLocaleString()}`)
    console.log(`   Characters: ${post.content.length}`)
    console.log()
  }

  console.log('To actually schedule, run without --dry-run flag\n')
}

// Main
const isDryRun = process.argv.includes('--dry-run')

if (isDryRun) {
  dryRun()
} else {
  scheduleToBuffer()
}
