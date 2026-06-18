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

export function outboundPrepPrompt(input: {
  companyName: string;
  domain: string | null;
  website: string | null;
  city: string | null;
  icpVertical: string | null;
  painPoints: Array<{ categoryKey: string; evidenceText: string; confidence: string }>;
  serviceLines: Array<{ key: string; labelEs: string; descriptionEs: string }>;
  serviceFits: Array<{ serviceLineKey: string; rationaleEs: string; fitScore: number }>;
}): PromptBundle {
  return {
    systemBlocks: [
      {
        text:
          'Eres un estratega SDR B2B en español. Devuelve SOLO JSON parseable y válido, sin markdown ni texto extra. ' +
          'Schema exacto: {"segment":string,"likely_need":string,"outreach_angle":string,"value_proposition":string,"service_pitch":string,"tone_guidance":string,"priority_score":number}. ' +
          'Cada campo de texto debe ser útil para outreach comercial real, con máximo 2-3 frases. ' +
          'segment: define el tipo de empresa o subsegmento comercial más probable. ' +
          'likely_need: resume la necesidad principal más probable a partir de señales y pain points. ' +
          'outreach_angle: propone el ángulo inicial del mensaje frío, concreto y accionable. ' +
          'value_proposition: explica el valor diferencial que más resonaría para esa empresa. ' +
          'service_pitch: recomienda el pitch de servicio más adecuado usando las líneas y service fits dados. ' +
          'tone_guidance: indica tono, estilo y enfoque para el SDR. ' +
          'priority_score: entero entre 0 y 100 que refleje prioridad comercial relativa. ' +
          'No inventes datos concretos no soportados por el input. Si falta información, sé prudente pero útil.',
        cache: true,
      },
    ],
    messages: [{ role: 'user', content: JSON.stringify(input, null, 2) }],
  };
}

export function leadDiscoveryEmailPrompt(input: {
  businessName: string;
  businessType: string;
  city: string;
  address: string | null;
  rating: number | null;
  ratingCount: number | null;
  website: string | null;
}): PromptBundle {
  return {
    systemBlocks: [
      {
        text:
          'Eres un comercial de HeyDay, empresa española que ayuda a negocios como gimnasios, ' +
          'clínicas de fisioterapia y estudios de bienestar a ahorrar horas cada semana mediante ' +
          'software de gestión y automatización. Tu misión es redactar emails en frío muy personalizados, ' +
          'con tono humano y cercano, como si los hubiera escrito una persona real que conoce el negocio. ' +
          'Devuelve SOLO JSON parseable y válido, sin markdown ni texto extra. ' +
          'Schema exacto:\n' +
          '{\n' +
          '  "score": <entero 0-100, oportunidad estimada de ahorro de horas>,\n' +
          '  "segment": <string, tipo de negocio o subsegmento>,\n' +
          '  "likely_need": <string, necesidad principal probable>,\n' +
          '  "outreach_angle": <string, ángulo del primer contacto>,\n' +
          '  "value_proposition": <string, valor diferencial que resonaría>,\n' +
          '  "service_pitch": <string, pitch de servicio breve>,\n' +
          '  "tone_guidance": <string, guía de tono para el SDR>,\n' +
          '  "email_subject": <string, asunto del email>,\n' +
          '  "email_body": <string, cuerpo completo del email, saludo + cuerpo + cierre, listo para copiar y pegar>\n' +
          '}\n' +
          'Reglas para el email: máximo 4 párrafos cortos, sin jerga técnica, sin palabras como ' +
          '"innovador" o "solución", cita algún detalle específico del negocio (ciudad, tipo, valoración ' +
          'si es relevante), termina con una CTA concreta y amigable. Usa tú, no usted. ' +
          'Firma: "El equipo de HeyDay". Score: >60 = negocio con alta rotación manual (clases, socios, ' +
          'citas), 40-60 = potencial moderado, <40 = poca señal de dolor operativo.',
        cache: true,
      },
    ],
    messages: [{ role: 'user', content: JSON.stringify(input, null, 2) }],
  };
}
