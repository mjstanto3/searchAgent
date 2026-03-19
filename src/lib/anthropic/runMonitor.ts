import Anthropic from '@anthropic-ai/sdk';
import type { Monitor } from '@/types';

export interface BriefResult {
  markdown: string;
  html: string;
  creditsUsed: number;
}

function getAnthropic() {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
  });
}

/**
 * Runs a monitor using the Anthropic API with web search enabled.
 * Returns a structured market research brief.
 * This function is server-side only — the API key is never exposed to the client.
 */
export async function runMonitor(
  monitor: Monitor,
  documentContext?: string,
): Promise<BriefResult> {
  const docHint = documentContext
    ? `\n\nAdditional context from uploaded document:\n${documentContext}`
    : '';

  const systemPrompt = `You are an expert market research analyst. Your job is to search the web and produce concise, high-signal intelligence briefs for business professionals.

Format your response as a structured brief with the following sections:
1. **Executive Summary** (2-3 sentences)
2. **Key Findings** (bullet points, each with source attribution)
3. **Market Signals** (notable trends or data points)
4. **Notable Sources** (list of URLs referenced)
5. **Recommended Actions** (2-3 actionable suggestions)

Be concise, cite your sources, and filter out noise. Surface only what matters.`;

  // Sanitize inputs to prevent prompt injection
  const sanitizedTopic = sanitizeInput(monitor.topic);
  const sanitizedSources = (monitor.sources ?? []).map(sanitizeInput);
  const sanitizedKeywords = (monitor.keywords ?? []).map(sanitizeInput);

  const sourcesLine =
    sanitizedSources.length > 0
      ? `Prioritize content from these sources: ${sanitizedSources.join(', ')}.`
      : '';

  const keywordsLine =
    sanitizedKeywords.length > 0
      ? `Focus especially on these areas: ${sanitizedKeywords.join(', ')}.`
      : '';

  const userPrompt = `Research topic: "${sanitizedTopic}"

Deliver up to ${monitor.max_results} findings.
${sourcesLine}
${keywordsLine}
${docHint}

Search the web for the most recent and relevant information on this topic. Produce a clean, professional research brief.`;

  const response = await getAnthropic().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: systemPrompt,
    // web_search_20250305 is Anthropic's built-in web search tool
    // See: https://docs.anthropic.com/en/docs/build-with-claude/tool-use/web-search-tool
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    messages: [
      {
        role: 'user',
        content: userPrompt,
      },
    ],
  });

  // Extract text content from the response
  let markdown = '';
  for (const block of response.content) {
    if (block.type === 'text') {
      markdown += block.text;
    }
  }

  const html = markdownToHtml(markdown);

  // Estimate credits used based on input/output tokens
  const totalTokens =
    (response.usage?.input_tokens ?? 0) +
    (response.usage?.output_tokens ?? 0);
  const creditsUsed = Math.max(1, Math.ceil(totalTokens / 1000));

  return { markdown, html, creditsUsed };
}

/**
 * Sanitizes user input to prevent prompt injection attacks.
 */
function sanitizeInput(input: string): string {
  return input
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
    .replace(/\{\{.*?\}\}/g, '') // Remove template injection attempts
    .replace(/<\/?[^>]+(>|$)/g, '') // Strip HTML tags
    .trim()
    .slice(0, 500); // Limit length
}

/**
 * Simple markdown-to-HTML converter for brief formatting.
 */
function markdownToHtml(markdown: string): string {
  return markdown
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`)
    .replace(
      /\[(.+?)\]\((.+?)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
    );
}
