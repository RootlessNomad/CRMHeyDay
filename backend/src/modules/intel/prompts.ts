import type { ChatMessage, SystemBlock } from '../../core/ai/anthropic-client.js';

interface PromptBundle {
  systemBlocks: SystemBlock[];
  messages: ChatMessage[];
}

export function extractCompanyFields(input: {
  url: string;
  textContent: string;
  excerpt?: string;
}): PromptBundle {
  return {
    systemBlocks: [
      {
        text:
          'Extrae datos de empresa desde contenido web público. Responde SOLO JSON parseable. ' +
          'Schema: {"name"?:string,"industry"?:string,"phone"?:string,"email"?:string,' +
          '"instagramHandle"?:string,"linkedinUrl"?:string,' +
          '"sizeSignal"?:("solo"|"micro"|"small"|"medium"|"large"),"city"?:string,"country"?:string}. ' +
          'No inventes valores. Omite campos no soportados por evidencia clara.',
        cache: true,
      },
    ],
    messages: [
      {
        role: 'user',
        content:
          `URL: ${input.url}\n` +
          `Excerpt HTML:\n${input.excerpt ?? ''}\n\n` +
          `Texto visible:\n${input.textContent}`,
      },
    ],
  };
}

export function inferPainPoints(input: {
  url: string;
  textContent: string;
  categoryKeys: string[];
}): PromptBundle {
  return {
    systemBlocks: [
      {
        text:
          'Detecta pain points comerciales desde una web pública. Usa SOLO estas categoryKey: ' +
          input.categoryKeys.join(', ') +
          '. Debes devolver JSON parseable con array de objetos {categoryKey, confidence, evidenceText, evidenceSourceUrl}. ' +
          'confidence solo puede ser observed|inferred|speculative. Debe haber al menos 1 item si existe evidencia razonable. ' +
          'evidenceText debe citar texto literal breve del HTML o texto visible. No inventes.',
        cache: true,
      },
    ],
    messages: [{ role: 'user', content: `URL: ${input.url}\n\n${input.textContent}` }],
  };
}

export function serviceFitRationale(input: {
  companyName: string;
  painPoints: Array<{ categoryKey: string; evidenceText: string; confidence: string }>;
  serviceLines: Array<{ key: string; labelEs: string; descriptionEs: string }>;
}): PromptBundle {
  return {
    systemBlocks: [
      {
        text:
          'Evalúa encaje de líneas de servicio para una empresa en español. Devuelve SOLO JSON parseable como array de ' +
          '{serviceLineKey, rationaleEs, expectedOutcomeEs, fitScore}. fitScore entre 0 y 100. ' +
          'Basa la justificación en los pain points dados, sin inventar evidencia.',
        cache: true,
      },
    ],
    messages: [
      {
        role: 'user',
        content: JSON.stringify(
          {
            companyName: input.companyName,
            painPoints: input.painPoints,
            serviceLines: input.serviceLines,
          },
          null,
          2,
        ),
      },
    ],
  };
}
