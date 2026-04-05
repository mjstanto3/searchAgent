import Anthropic from '@anthropic-ai/sdk';
import { MODELS, TEMPERATURES } from '@/lib/anthropic/config';

/**
 * Generates a 2-sentence expert persona for a research agent based on the monitor topic + context.
 * Uses claude-haiku (cheap + fast). Result is cached on the monitor record.
 */
export async function generateAgentRole(topic: string): Promise<string> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const message = await anthropic.messages.create({
    model: MODELS.MAGPIE_AGENT_ROLE,
    max_tokens: 200,
    temperature: TEMPERATURES.MAGPIE_AGENT_ROLE,
    messages: [
      {
        role: 'user',
        content: `You are configuring a specialized AI research agent. Write exactly 2 sentences describing the expert persona for an agent that will research: "${topic}"

The persona must:
- Specify the agent's domain expertise and professional background
- Describe the specific lens through which this agent evaluates and prioritizes information
- Start with "You are"
- Be concrete and specific to the topic (not generic)

Return only the persona text — no preamble, no explanation, no quotes.`,
      },
    ],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text.trim() : '';

  // Ensure it starts with "You are" — fall back gracefully if model deviates
  if (!text.toLowerCase().startsWith('you are')) {
    return `You are a specialized research analyst focused on ${topic}.`;
  }

  return text;
}
