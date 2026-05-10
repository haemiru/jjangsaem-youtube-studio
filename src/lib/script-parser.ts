export type Speaker = 'jjangsaem' | 'parent';
export type ParseMode = 'dialogue' | 'solo';

export interface ScriptLine {
  speaker: Speaker;
  text: string;
  style?: string;
  slideIdx: number;
  rawLineNo: number;
}

export interface ParsedScript {
  lines: ScriptLine[];
  slideCount: number;
  errors: string[];
  warnings: string[];
}

const SLIDE_HEADER = /^#{1,3}\s*(?:슬라이드\s*)?(\d+)\b/;
// 라벨: [부모], [엄마], [아빠], [호스트], [짱샘] / 콜론으로 style 추가 가능
const LABEL = /^\[\s*(부모|엄마|아빠|호스트|짱샘)\s*(?::\s*([^\]]+?))?\s*\]\s*(.*)$/;

const PARENT_ALIASES = new Set(['부모', '엄마', '아빠', '호스트']);

export function parseScript(input: string, mode: ParseMode = 'dialogue'): ParsedScript {
  const lines = input.replace(/\r\n/g, '\n').split('\n');
  const out: ScriptLine[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  let slideIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed) continue;

    const slideMatch = trimmed.match(SLIDE_HEADER);
    if (slideMatch) {
      slideIdx = Number(slideMatch[1]) - 1;
      continue;
    }

    const labelMatch = trimmed.match(LABEL);
    if (!labelMatch) {
      // solo 모드: 라벨 없는 줄 = 새로운 짱샘 라인
      if (mode === 'solo') {
        if (slideIdx < 0) {
          errors.push(`L${i + 1}: 슬라이드 헤더(예: "## 슬라이드 1") 전에 대사가 나옴`);
          continue;
        }
        out.push({
          speaker: 'jjangsaem',
          text: trimmed,
          slideIdx,
          rawLineNo: i + 1,
        });
        continue;
      }
      // dialogue 모드: 라벨 없는 줄 — 직전 라인에 이어붙임
      if (out.length > 0 && slideIdx === out[out.length - 1].slideIdx) {
        out[out.length - 1].text += ' ' + trimmed;
      } else {
        warnings.push(`L${i + 1}: 라벨 없는 줄 무시 — "${trimmed.slice(0, 30)}"`);
      }
      continue;
    }

    if (slideIdx < 0) {
      errors.push(`L${i + 1}: 슬라이드 헤더(예: "## 슬라이드 1") 전에 대사가 나옴`);
      continue;
    }

    const label = labelMatch[1];
    const style = labelMatch[2]?.trim() || undefined;
    const text = labelMatch[3].trim();
    if (!text) {
      warnings.push(`L${i + 1}: 비어있는 대사 무시`);
      continue;
    }

    const speaker: Speaker = PARENT_ALIASES.has(label) ? 'parent' : 'jjangsaem';
    out.push({ speaker, text, style, slideIdx, rawLineNo: i + 1 });
  }

  // 300자 초과 경고
  for (const line of out) {
    if (line.text.length > 300) {
      warnings.push(
        `L${line.rawLineNo}: ${line.text.length}자 — Supertone 300자 제한 초과, 분할 필요`
      );
    }
  }

  const slideCount = out.length === 0 ? 0 : Math.max(...out.map((l) => l.slideIdx)) + 1;

  return { lines: out, slideCount, errors, warnings };
}
