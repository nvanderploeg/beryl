const VARY = ['Cookie', 'Authorization'];

// What a response shows depends on who asks: no shared cache may serve it to someone else.
export function varyOnLogin(response: Response): Response {
	let out = response;
	try {
		out.headers.set('vary', out.headers.get('vary') ?? '');
	} catch {
		out = new Response(response.body, response);
	}
	if (!out.headers.has('cache-control')) out.headers.set('cache-control', 'private');
	const have = new Set(
		(out.headers.get('vary') ?? '')
			.split(',')
			.map((token) => token.trim())
			.filter(Boolean)
	);
	if (!have.has('*')) {
		for (const token of VARY) {
			if (![...have].some((h) => h.toLowerCase() === token.toLowerCase())) have.add(token);
		}
		out.headers.set('vary', [...have].join(', '));
	}
	return out;
}
