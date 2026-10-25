export type Tone = 'pp' | 'p' | 'z' | 'm' | 'mm' | 'text' | 'none';

const tones: Record<string, Tone> = {
	'++': 'pp',
	'+': 'p',
	'0': 'z',
	'-': 'm',
	'−': 'm',
	'--': 'mm',
	'−−': 'mm'
};

export function scoreTone(score: string | undefined): Tone {
	const s = score?.trim();
	if (!s) return 'none';
	return tones[s] ?? 'text';
}

export function scoreText(score: string | undefined): string {
	const tone = scoreTone(score);
	if (tone === 'none') return '·';
	if (tone === 'm') return '−';
	if (tone === 'mm') return '−−';
	return score!.trim();
}
