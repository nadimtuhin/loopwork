#!/usr/bin/env bun

/**
 * Generate LinkedIn posts in various formats
 *
 * Usage:
 *   bun run scripts/generate-posts.ts [format]
 *
 * Formats: json, csv, markdown, text (default: markdown)
 */

const POSTS = [
  {
    day: 1,
    dayName: 'Monday',
    title: 'The Origin Story',
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
    dayName: 'Wednesday',
    title: 'The Technical Deep Dive',
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
    dayName: 'Friday',
    title: 'The Vision',
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

function generateJSON() {
  const now = new Date()
  const nextMonday = new Date(now)
  nextMonday.setDate(now.getDate() + ((1 + 7 - now.getDay()) % 7 || 7))
  nextMonday.setHours(9, 0, 0, 0)

  const posts = POSTS.map((post) => {
    const scheduleDate = new Date(nextMonday)
    scheduleDate.setDate(nextMonday.getDate() + (post.day - 1))

    return {
      title: post.title,
      day: post.dayName,
      scheduledAt: scheduleDate.toISOString(),
      content: post.content,
      characterCount: post.content.length,
    }
  })

  console.log(JSON.stringify(posts, null, 2))
}

function generateCSV() {
  console.log('day,title,scheduled_at,content')

  const now = new Date()
  const nextMonday = new Date(now)
  nextMonday.setDate(now.getDate() + ((1 + 7 - now.getDay()) % 7 || 7))
  nextMonday.setHours(9, 0, 0, 0)

  for (const post of POSTS) {
    const scheduleDate = new Date(nextMonday)
    scheduleDate.setDate(nextMonday.getDate() + (post.day - 1))

    const escapedContent = post.content.replace(/"/g, '""')
    console.log(
      `${post.dayName},"${post.title}",${scheduleDate.toISOString()},"${escapedContent}"`
    )
  }
}

function generateMarkdown() {
  const now = new Date()
  const nextMonday = new Date(now)
  nextMonday.setDate(now.getDate() + ((1 + 7 - now.getDay()) % 7 || 7))
  nextMonday.setHours(9, 0, 0, 0)

  console.log('# Loopwork LinkedIn Post Series\n')

  for (const post of POSTS) {
    const scheduleDate = new Date(nextMonday)
    scheduleDate.setDate(nextMonday.getDate() + (post.day - 1))

    console.log(`## Post ${post.day} - ${post.title}`)
    console.log(`**Schedule**: ${post.dayName}, ${scheduleDate.toLocaleDateString()} at 9:00 AM`)
    console.log(`**Characters**: ${post.content.length}/3000\n`)
    console.log('---\n')
    console.log(post.content)
    console.log('\n---\n')
  }
}

function generateText() {
  const now = new Date()
  const nextMonday = new Date(now)
  nextMonday.setDate(now.getDate() + ((1 + 7 - now.getDay()) % 7 || 7))
  nextMonday.setHours(9, 0, 0, 0)

  for (const post of POSTS) {
    const scheduleDate = new Date(nextMonday)
    scheduleDate.setDate(nextMonday.getDate() + (post.day - 1))

    console.log(`=== POST ${post.day}: ${post.title.toUpperCase()} ===`)
    console.log(`Schedule: ${post.dayName}, ${scheduleDate.toLocaleDateString()} at 9:00 AM`)
    console.log(`Characters: ${post.content.length}/3000`)
    console.log()
    console.log(post.content)
    console.log('\n' + '='.repeat(80) + '\n')
  }
}

// Main
const format = process.argv[2] || 'markdown'

switch (format.toLowerCase()) {
  case 'json':
    generateJSON()
    break
  case 'csv':
    generateCSV()
    break
  case 'markdown':
  case 'md':
    generateMarkdown()
    break
  case 'text':
  case 'txt':
    generateText()
    break
  default:
    console.error(`Unknown format: ${format}`)
    console.error('Available formats: json, csv, markdown, text')
    process.exit(1)
}
