# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.3.x   | :white_check_mark: |
| 0.2.x   | :white_check_mark: |
| < 0.2   | :x:                |

## Security Considerations

### AI CLI Permissions

Loopwork executes AI CLIs (Claude, OpenCode) with elevated permissions to automate tasks:

- **Claude CLI**: Uses `--dangerously-skip-permissions` flag
- **OpenCode**: Uses `{"*":"allow"}` permission model

⚠️ **WARNING**: This means the AI agents have full access to your filesystem and can execute commands. Only use Loopwork in:
- Isolated development environments
- Trusted projects
- Sandboxed containers (recommended for production)

### Environment Variables

Loopwork may use sensitive credentials:

```bash
# Telegram notifications (optional)
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id

# GitHub backend (optional)
GITHUB_TOKEN=your_github_token
```

**Best Practices**:
- Never commit `.env` files to version control
- Use `.env.local` for local development
- Rotate tokens regularly
- Use least-privilege tokens (read/write only what's needed)

### File System Access

Loopwork can:
- Read and write files in the working directory
- Execute shell commands
- Create/modify git commits
- Access network resources

**Recommendations**:
- Run in dedicated project directories
- Use `.gitignore` to protect sensitive files
- Review AI-generated code before committing
- Run in containers for production use

### Dependency Security

We use automated tools to scan for vulnerabilities:

```bash
# Check for known vulnerabilities
npm audit

# Check for outdated packages
npm outdated

# Run Trivy scanner (if installed)
trivy fs . --severity CRITICAL,HIGH,MEDIUM

# Or use npm scripts
npm run security:check
npm run security:audit
```

#### Installing Trivy (Optional)

Trivy provides comprehensive security scanning:

```bash
# macOS
brew install aquasecurity/trivy/trivy

# Linux
wget -qO - https://aquasecurity.github.io/trivy-repo/deb/public.key | sudo apt-key add -
echo "deb https://aquasecurity.github.io/trivy-repo/deb $(lsb_release -sc) main" | sudo tee -a /etc/apt/sources.list.d/trivy.list
sudo apt-get update
sudo apt-get install trivy

# Scan the project
trivy fs . --severity CRITICAL,HIGH,MEDIUM
```

### Secure Configuration

Example `loopwork.config.ts`:

```typescript
export default {
  backend: {
    type: 'json' as const,
    tasksFile: '.specs/tasks/tasks.json', // Safe: local file
  },
  // Don't hardcode secrets here!
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,  // ✅ Good
    chatId: process.env.TELEGRAM_CHAT_ID,      // ✅ Good
  }
}
```

### Container Security (Recommended)

Run Loopwork in Docker for isolation:

```dockerfile
FROM imbios/bun-node:latest

WORKDIR /workspace
RUN npm install -g loopwork claude-cli

# Non-root user
RUN useradd -m loopwork
USER loopwork

CMD ["loopwork", "run"]
```

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, send an email to: [your-email@example.com]

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We will respond within 48 hours and provide updates on the fix timeline.

## Security Updates

Security patches are released as:
- **Critical**: Immediate patch release (e.g., 0.3.1)
- **High**: Within 7 days
- **Medium/Low**: Next minor/major release

Subscribe to GitHub releases to get notified of security updates.

## Security Checklist for Users

- [ ] Run Loopwork in isolated environments
- [ ] Use `.env` files (not hardcoded secrets)
- [ ] Review AI-generated code before committing
- [ ] Keep dependencies updated (`npm audit fix`)
- [ ] Use least-privilege API tokens
- [ ] Enable GitHub security alerts
- [ ] Consider running in containers for production
- [ ] Regularly rotate credentials
- [ ] Monitor logs for suspicious activity

## Known Security Trade-offs

### Why `--dangerously-skip-permissions`?

Loopwork is designed for **automated task execution**. Requiring manual permission approval defeats the purpose of automation. This is a deliberate trade-off:

**Security** ⚖️ **Automation**

Mitigations:
1. Use in trusted environments only
2. Review task descriptions before running
3. Use containers for isolation
4. Monitor AI actions through logs
5. Set appropriate timeouts and circuit breakers

### Output Logging

All AI interactions are logged to:
- `.loopwork/runs/{namespace}/{session}/logs/` - Full conversation logs
- May contain sensitive information

**Action**: Add `.loopwork/` to `.gitignore` (already done)

## Third-Party Security

Dependencies we rely on:
- `chalk` - Terminal styling (low risk)
- `commander` - CLI parsing (low risk)
- `ink` - React for CLIs (low risk)
- `react` - UI components (low risk)

AI CLIs (external):
- `claude-cli` - Official Anthropic CLI
- `opencode` - Community AI CLI

**Note**: We don't control these CLIs. Review their security policies separately.

## License

This security policy is part of the Loopwork project and follows the same MIT license.
