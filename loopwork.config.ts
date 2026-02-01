/**
 * DEVELOPMENT Loopwork Configuration
 *
 * This config is used for development and testing in the monorepo.
 * For production projects, run `loopwork init` to generate a fresh config.
 *
 * 📚 Documentation:
 * - OpenCode models: opencode-models-reference.md
 * - Documentation plugins: documentation-plugins-examples.md
 * - All plugins reference: loopwork.config.old.ts (comprehensive examples)
 */
import {
  defineConfig,
  compose,
  withPlugin,
  withJSONBackend,
  withCli,
  withGitAutoCommit,
  withSmartTestTasks,
  withTaskRecovery,
  ModelPresets,
  createModel,
} from "@loopwork-ai/loopwork";
import { withCostTracking } from "@loopwork-ai/cost-tracking";

export default compose(
  // Choose your backend
  withJSONBackend({ tasksFile: ".specs/tasks/tasks.json" }),

  // Cost-Aware Mode: Free models first, then paid models
  withCli({
    models: [
      // === FREE TIER MODELS (costWeight: 5) - Used First ===
      // Best for reasoning
      // createModel({ name: "deepseek-r1", cli: "opencode", model: "openrouter/deepseek/deepseek-r1:free", timeout: 600, costWeight: 5 }),

      // Best for coding
      // createModel({ name: "qwen3-coder", cli: "opencode", model: "openrouter/qwen/qwen3-coder:free", timeout: 600, costWeight: 5 }),

      // Best balanced free model
      // createModel({ name: "llama-3.3-70b", cli: "opencode", model: "openrouter/meta-llama/llama-3.3-70b-instruct:free", timeout: 600, costWeight: 5 }),

      // Good for general tasks
      // createModel({ name: "gemma-3-27b", cli: "opencode", model: "openrouter/google/gemma-3-27b-it:free", timeout: 600, costWeight: 5 }),

      // Additional free models
      // createModel({ name: "mistral-7b", cli: "opencode", model: "openrouter/mistralai/mistral-7b-instruct:free", timeout: 600, costWeight: 5 }),
      // createModel({ name: "devstral-2512", cli: "opencode", model: "openrouter/mistralai/devstral-2512:free", timeout: 600, costWeight: 5 }),
      // Zhipu AI Coding Plan Models (ZAI) - Specialized for coding
      ModelPresets.geminiFlash({ timeout: 600, costWeight: 15 }),
      // Minimax Coding Plan Models - Specialized for coding
      createModel({
        name: "minimax-m2.1-code",
        cli: "opencode",
        model: "minimax-coding-plan/MiniMax-M2.1",
        timeout: 600,
        costWeight: 20,
      }),
      createModel({
        name: "glm-4.7-flash",
        cli: "opencode",
        model: "zai-coding-plan/glm-4.7-flash",
        timeout: 600,
        costWeight: 12,
      }),
      createModel({
        name: "glm-4.7",
        cli: "opencode",
        model: "zai-coding-plan/glm-4.7",
        timeout: 600,
        costWeight: 22,
      }),

      createModel({
        name: "kimi-k2.5-coding",
        cli: "opencode",
        model: "kimi-for-coding/k2p5",
        timeout: 600,
        costWeight: 60,
      }),
      createModel({
        name: "minimax-m2.1-free",
        cli: "opencode",
        model: "opencode/minimax-m2.1-free",
        timeout: 600,
        costWeight: 5,
      }),

      // === PAID MODELS (costWeight: 10-30) - Used After Free ===
      // Fast & cheap
      ModelPresets.claudeHaiku({ timeout: 600, costWeight: 10 }),

      createModel({
        name: "glm-4.7-free",
        cli: "opencode",
        model: "opencode/glm-4.7-free",
        timeout: 600,
        costWeight: 5,
      }),

      createModel({
        name: "kimi-k2.5-free",
        cli: "opencode",
        model: "opencode/kimi-k2.5-free",
        timeout: 600,
        costWeight: 5,
      }),

      // Cerebras Models - Fast and cheap (limited tokens)
      createModel({
        name: "cerebras-qwen-3",
        cli: "opencode",
        model: "cerebras/qwen-3-235b-a22b-instruct-2507",
        timeout: 120,
        costWeight: 12,
      }),
      createModel({
        name: "cerebras-glm-4.7",
        cli: "opencode",
        model: "cerebras/zai-glm-4.7",
        timeout: 120,
        costWeight: 12,
      }),

      // Balanced
      ModelPresets.opencodeGeminiProLow({ timeout: 600, costWeight: 25 }),
      // ModelPresets.claudeSonnet({ timeout: 600, costWeight: 30 }),

      // Uncomment for more premium models:
      createModel({
        name: "antigravity-gemini-3-flash",
        cli: "opencode",
        model: "google/antigravity-gemini-3-flash",
        timeout: 600,
        costWeight: 15,
      }),
      createModel({
        name: "antigravity-claude-sonnet-4-5",
        cli: "opencode",
        model: "google/antigravity-claude-sonnet-4-5",
        timeout: 600,
        costWeight: 30,
      }),
      createModel({
        name: "antigravity-claude-sonnet-4-5",
        cli: "opencode",
        model: "google/antigravity-claude-sonnet-4-5",
        timeout: 600,
        costWeight: 30,
      }),
    ],
    fallbackModels: [
      // Premium models for complex tasks
      // ModelPresets.claudeHaiku({ timeout: 600, costWeight: 10 }),
      ModelPresets.geminiFlash({ timeout: 900, costWeight: 15 }),
      createModel({
        name: "antigravity-claude-sonnet-4-5",
        cli: "opencode",
        model: "google/antigravity-claude-sonnet-4-5",
        timeout: 600,
        costWeight: 30,
      }),
      createModel({
        name: "kimi-k2.5-tee",
        cli: "opencode",
        model: "chutes/moonshotai/Kimi-K2.5-TEE",
        timeout: 600,
        costWeight: 65,
      }),
      // ModelPresets.opencodeGeminiProHigh({ timeout: 900, costWeight: 60 }),
      // createModel({ name: "claude-opus", cli: "claude", model: "opus", timeout: 900, costWeight: 100 }),
    ],
    selectionStrategy: "random", // Uses cheapest (lowest costWeight) first!
  }),

  // Track costs
  withCostTracking({
    enabled: true,
    // defaultModel: "claude-4.5-sonnet",
  }),

  // Auto-commit after each task
  withGitAutoCommit({
    enabled: true,
    addAll: true,
    coAuthor: "Loopwork AI <noreply@loopwork.ai>",
    skipIfNoChanges: true,
  }),

  // Smart Test Tasks - Automatically create test tasks for new features
  withSmartTestTasks({
    enabled: true,
    autoCreate: false, // Suggest but don't auto-create (requires approval)
    maxSuggestions: 3, // Max 3 test task suggestions per completed task
    minConfidence: 70, // Only suggest tests with 70%+ confidence
    cli: "opencode", // Use free OpenCode models for analysis
    model: "zai-coding-plan/glm-4.7", // GLM 4.7 for analysis
  }),

  // Task Recovery - AI-powered failure analysis and recovery
  withTaskRecovery({
    enabled: true,
    autoRecover: true, // Automatically attempt recovery on failures
    maxRetries: 3, // Max recovery attempts per task
    cli: "opencode", // Use OpenCode CLI
    model: "zai-coding-plan/glm-4.7", // Use GLM 4.7 for failure analysis
  }),

  // Documentation Plugin - Auto-update CHANGELOG.md after each task
  // For advanced options (AI-powered, README updates), see: documentation-plugins-examples.md
  // Uncomment to enable simple documentation:
  withPlugin({
    name: "documentation",
    async onTaskComplete(context, result) {
      const fs = await import("fs");
      const path = await import("path");

      const changelogPath = path.join(process.cwd(), "CHANGELOG.md");
      const taskTitle = context.task?.title || "Task completed";
      const taskId = context.task?.id || "";
      const date = new Date().toISOString().split("T")[0];

      // Read existing changelog
      let changelog = "";
      if (fs.existsSync(changelogPath)) {
        changelog = fs.readFileSync(changelogPath, "utf-8");
      }

      // Create new entry
      const entry = `\n### ${date} - ${taskId}\n- ${taskTitle}\n`;

      // Insert after header (assumes ## Unreleased section exists)
      if (changelog.includes("## Unreleased")) {
        changelog = changelog.replace(
          "## Unreleased\n",
          `## Unreleased\n${entry}`,
        );
      } else {
        // Create Unreleased section if it doesn't exist
        changelog = `# Changelog\n\n## Unreleased\n${entry}\n${changelog}`;
      }

      // Write back
      fs.writeFileSync(changelogPath, changelog);
      console.log(`✅ Updated CHANGELOG.md`);
    },
  }),
)(
  defineConfig({
    parallel: 5,
    maxIterations: 500,
    timeout: 600,
    namespace: "default",
    autoConfirm: true,
    debug: true,
    maxRetries: 10,
    taskDelay: 2000,
    retryDelay: 6000,
    orphanWatch: {
      enabled: true,
      interval: 60000, // Check every minute
      maxAge: 1800000, // Kill processes older than 30 minutes
      autoKill: true, // Auto-kill confirmed orphans
      patterns: [],
    },
  } as any),
);
