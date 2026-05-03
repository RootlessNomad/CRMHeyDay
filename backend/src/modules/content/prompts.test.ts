import { describe, expect, it } from 'vitest';

import { buildDraftPrompt, buildIdeaPrompt } from './prompts.js';

describe('content prompts', () => {
  it('buildIdeaPrompt incluye pillar.labelEs y count en systemBlocks text', () => {
    const prompt = buildIdeaPrompt({
      pillar: { key: 'growth', labelEs: 'Crecimiento', descriptionEs: 'Ideas de crecimiento' },
      briefEs: 'Brief',
      count: 5,
    });

    expect(prompt.systemBlocks[0]?.text).toContain('Crecimiento');
    expect(prompt.systemBlocks[0]?.text).toContain('5');
  });

  it('buildDraftPrompt instagram incluye instruccion de hashtags', () => {
    const prompt = buildDraftPrompt({
      channel: 'instagram',
      idea: { title: 'Title', angle: 'Angle', briefEs: 'Brief' },
      pillar: { labelEs: 'Crecimiento', descriptionEs: 'Ideas de crecimiento' },
    });

    expect(prompt.systemBlocks[0]?.text).toContain('hashtags');
  });

  it('buildDraftPrompt linkedin menciona profesional', () => {
    const prompt = buildDraftPrompt({
      channel: 'linkedin',
      idea: { title: 'Title', angle: 'Angle', briefEs: 'Brief' },
      pillar: { labelEs: 'Crecimiento', descriptionEs: 'Ideas de crecimiento' },
    });

    expect(prompt.systemBlocks[0]?.text).toContain('profesional');
  });
});
