/** Strip control characters, template injection patterns, and HTML tags. */
export function sanitizeInput(input: string, maxLength = 500): string {
  return input
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .replace(/\{\{.*?\}\}/g, '')
    .replace(/<\/?[^>]+(>|$)/g, '')
    .trim()
    .slice(0, maxLength);
}
