import Anthropic from '@anthropic-ai/sdk';

export const CLAUDE_MODEL = 'claude-opus-4-7';

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY 환경변수가 없습니다');
  _client = new Anthropic({ apiKey });
  return _client;
}

export interface GenerateOptions {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}

export async function generate(opts: GenerateOptions): Promise<string> {
  const client = getClient();
  const res = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: opts.maxTokens ?? 4096,
    temperature: opts.temperature ?? 0.9,
    system: opts.system,
    messages: [{ role: 'user', content: opts.user }],
  });

  const textBlocks = res.content.filter(
    (b): b is Anthropic.TextBlock => b.type === 'text'
  );
  if (textBlocks.length === 0) {
    throw new Error('Claude 응답에 텍스트 블록이 없습니다');
  }
  return textBlocks.map((b) => b.text).join('\n').trim();
}
