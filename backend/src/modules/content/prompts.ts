import type { ChatMessage, SystemBlock } from '../../core/ai/anthropic-client.js';

export interface PromptBundle {
  systemBlocks: SystemBlock[];
  messages: ChatMessage[];
}

export function buildIdeaPrompt(input: {
  pillar: { key: string; labelEs: string; descriptionEs: string };
  vertical?: string | null;
  serviceLine?: { key: string; labelEs: string; descriptionEs: string } | null;
  briefEs: string;
  count: number;
}): PromptBundle {
  return {
    systemBlocks: [
      {
        text:
          `Genera ${input.count} ideas de contenido en español para el pilar "${input.pillar.labelEs}". ` +
          'Devuelve SOLO JSON parseable como array de objetos con schema exacto ' +
          '[{"title":string,"angle":string}]. Cada title debe ser concreto y cada angle debe ser ' +
          'accionable, distinto de los demás y listo para convertirse en pieza multi-canal. ' +
          'No devuelvas markdown ni texto extra.',
        cache: true,
      },
    ],
    messages: [
      {
        role: 'user',
        content: JSON.stringify(
          {
            pillar: input.pillar,
            vertical: input.vertical ?? null,
            serviceLine: input.serviceLine ?? null,
            briefEs: input.briefEs,
            count: input.count,
          },
          null,
          2,
        ),
      },
    ],
  };
}

export function buildDraftPrompt(input: {
  channel: 'instagram' | 'linkedin' | 'newsletter';
  idea: { title: string; angle: string; briefEs: string };
  pillar: { labelEs: string; descriptionEs: string };
  vertical?: string | null;
}): PromptBundle {
  const channelInstruction =
    input.channel === 'instagram'
      ? 'Canal instagram: primera línea con hook punchy, 80-150 palabras, máximo 3 emojis, CTA claro y entre 5 y 10 hashtags. JSON exacto: {"title":string,"body":string,"hooks":string[],"ctas":string[],"hashtags":string[]}.'
      : input.channel === 'linkedin'
        ? 'Canal linkedin: 150-300 palabras, hook profesional, párrafos cortos, datos concretos, máximo 3 hashtags. JSON exacto: {"title":string,"body":string,"hooks":string[],"ctas":string[],"hashtags":string[]}.'
        : 'Canal newsletter: usa subject line en title, 250-500 palabras en body con subtítulos markdown y CTA final. JSON exacto: {"title":string,"body":string,"hooks":[],"ctas":string[],"hashtags":[]}.';

  return {
    systemBlocks: [
      {
        text:
          'Eres un copywriter B2B/B2C en español. Claude DEBE responder SOLO JSON parseable, sin markdown envolvente ni texto extra. ' +
          channelInstruction,
        cache: true,
      },
    ],
    messages: [
      {
        role: 'user',
        content: JSON.stringify(
          {
            channel: input.channel,
            idea: input.idea,
            pillar: input.pillar,
            vertical: input.vertical ?? null,
          },
          null,
          2,
        ),
      },
    ],
  };
}
