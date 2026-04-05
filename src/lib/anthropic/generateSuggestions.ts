import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'crypto';
import type { Monitor, RunSuggestion } from '@/types';

interface SuggestionPayload {
  suggestions: Array<{
    type: RunSuggestion['type'];
    text: string;
    rationale: string;
  }>;
}

/**
 * Generates up to 5 research-improvement suggestions from a completed brief.
 * Uses claude-haiku — fast and inexpensive, no web search needed.
 * Never throws; returns [] on any failure so the run is never blocked.
 */
export async function generateSuggestions(
  monitor: Monitor,
  briefMarkdown: string,
): Promise<RunSuggestion[]> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const existingKeywords = (monitor.keywords ?? []).join(', ') || 'none';
  const existingSources = (monitor.sources ?? []).join(', ') || 'none';

  const prompt = `A market research brief was just generated for the following monitor.

Topic: "${monitor.topic}"
Current keywords: ${existingKeywords}
Current priority sources: ${existingSources}

Based on the brief, generate up to 5 concrete suggestions to improve future searches on this topic.

Suggestion types:
- "keyword": a new keyword phrase the monitor should track (not already in current keywords)
- "source": a specific domain or publication worth adding as a priority source
- "topic_refinement": a way to narrow, expand, or reframe the topic for better signal
- "gap": an adjacent area or question not covered by this brief that seems worth monitoring

Return ONLY this JSON (no markdown, no extra text):
{"suggestions":[{"type":"keyword","text":"enterprise AI adoption rates Q1 2025","rationale":"The brief surfaced enterprise adoption data but the current keywords don't target this segment specifically"}]}

Brief:
${briefMarkdown.slice(0, 3000)}`;

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 512,
      system:
        'You are a market research strategy advisor. You respond ONLY with valid JSON — no markdown fences, no explanation.',
      messages: [{ role: 'user', content: prompt }],
    });

    const rawText = response.content.find((b) => b.type === 'text')?.text ?? '';
    // Strip markdown fences if Claude wraps the response despite instructions
    const text = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    const parsed: SuggestionPayload = JSON.parse(text);

    return parsed.suggestions.slice(0, 5).map((s) => ({
      id: randomUUID(),
      type: s.type,
      text: s.text,
      rationale: s.rationale,
      applied: false,
    }));
  } catch (err) {
    console.error('generateSuggestions failed (non-blocking):', err);
    return [];
  }
}
