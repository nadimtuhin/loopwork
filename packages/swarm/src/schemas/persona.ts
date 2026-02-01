import { z } from 'zod'

export const AgentPersonaSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().min(1, "Description is required"),
  prompt: z.string().min(1, "System prompt is required"),
  tools: z.array(z.string()).optional(),
  model: z.string().optional(),
  env: z.record(z.string()).optional(),
  timeout: z.number().positive().optional(),
  role: z.string().optional().describe("Role of the agent in the swarm"),
  capabilities: z.array(z.string()).optional().describe("High-level capabilities/skills"),
})

export type AgentPersona = z.infer<typeof AgentPersonaSchema>
