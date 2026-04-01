import Anthropic from '@anthropic-ai/sdk';

if (!process.env['ANTHROPIC_API_KEY']) {
  throw new Error('Missing ANTHROPIC_API_KEY');
}

export const anthropic = new Anthropic({
  apiKey: process.env['ANTHROPIC_API_KEY'],
});

export const AGENT_MODEL = 'claude-sonnet-4-20250514';
export const AGENT_MAX_TOKENS = 1000;
