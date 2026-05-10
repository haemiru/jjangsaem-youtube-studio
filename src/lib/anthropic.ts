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
  /** @deprecated Opus 4.7부터 미지원 — 전달해도 무시된다 */
  temperature?: number;
}

export async function generate(opts: GenerateOptions): Promise<string> {
  const client = getClient();
  const res = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: opts.maxTokens ?? 4096,
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

export interface SlideImage {
  /** 0-based slide index */
  idx: number;
  /** image bytes */
  data: Buffer;
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp';
}

export interface GenerateWithImagesOptions {
  system: string;
  user: string;
  slides: SlideImage[]; // 슬라이드 1부터 순서대로
  maxTokens?: number;
}

/**
 * 슬라이드 이미지들을 함께 첨부해서 Claude를 호출.
 * 각 이미지 앞에 "[슬라이드 N]" 텍스트를 두어 모델이 인덱스를 명확히 인지.
 * user 메시지는 이미지 블록들 다음에 추가됨.
 */
export async function generateWithImages(
  opts: GenerateWithImagesOptions
): Promise<string> {
  const client = getClient();

  const content: Anthropic.ContentBlockParam[] = [];
  for (const s of opts.slides) {
    content.push({ type: 'text', text: `[슬라이드 ${s.idx + 1}]` });
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: s.mediaType,
        data: s.data.toString('base64'),
      },
    });
  }
  content.push({ type: 'text', text: opts.user });

  const res = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: opts.maxTokens ?? 8000,
    system: opts.system,
    messages: [{ role: 'user', content }],
  });

  const textBlocks = res.content.filter(
    (b): b is Anthropic.TextBlock => b.type === 'text'
  );
  if (textBlocks.length === 0) {
    throw new Error('Claude 응답에 텍스트 블록이 없습니다');
  }
  return textBlocks.map((b) => b.text).join('\n').trim();
}
