const OurDomain = '.near.fm';
const NearSocialDomain = 'near.social';
const DefaultWidget = 'mob.near/widget/Near.FM.Remote';
const PremiumAccountId = 'premium.social.near';
const NonPremiumRedirectWidget = 'mob.near/widget/Near.FM.Remote.NonPremium';
const MissingRedirectWidget = 'mob.near/widget/Near.FM.Remote.Missing';
const FaviconUrl = 'https://near.social/nearfm.png';

const Title = 'URL Shortener - Near Freaking Magic';
const Description = 'The best premium URL Shortener for NEAR accounts';
const PersonalDescription = 'Your personal premium URL Shortener for NEAR';

const RedirectTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <link rel="icon" href="/favicon.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta property="og:title" content="" />
  <meta property="og:description" content="" />
  <meta property="og:image" content="">
  <meta property="og:type" content="website">
  <meta http-equiv="refresh" content="" />
  <title></title>
</head>
<body>
<script>
  window.location.replace("{url}");
</script>
</body>
</html>`;

async function socialGet(keys, blockHeight, parse) {
	const request = await fetch('https://api.near.social/get', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			keys: [keys],
			blockHeight,
		}),
	});
	let data = await request.json();
	const parts = keys.split('/');
	for (let i = 0; i < parts.length; i++) {
		const part = parts[i];
		if (part === '*' || part === '**') {
			break;
		}
		data = data?.[part];
	}
	if (parse) {
		try {
			data = JSON.parse(data);
		} catch (e) {
			return null;
		}
	}
	return data;
}

class WidgetDataInjector {
	constructor({ widget, props, extraScript }) {
		this.widget = widget.replace(/[^-.\w\/]/g, '');
		this.props = props || {};
		this.extraScript = extraScript || '';
	}

	element(element) {
		element.prepend(
			`<script>window.InjectedConfig = { forcedWidget: '${this.widget}', props: JSON.parse('${JSON.stringify(
				this.props
			)}'), hideMenu: true };</script>`,
			{
				html: true,
			}
		);
	}
}

class FaviconInjector {
	constructor({ favicon }) {
		this.favicon = favicon;
	}

	element(element) {
		if (this.favicon) {
			element.setAttribute('href', this.favicon);
		}
	}
}

class MetaTitleInjector {
	constructor({ title }) {
		this.title = title || '';
	}

	element(element) {
		element.setAttribute('content', this.title);
	}
}

class MetaImageInjector {
	constructor({ image }) {
		this.image = image;
	}

	element(element) {
		if (this.image) {
			element.setAttribute('content', this.image);
		}
	}
}

class MetaTwitterCardInjector {
	constructor({ image }) {
		this.image = image;
	}

	element(element) {
		if (!this.image) {
			element.setAttribute('content', 'summary');
		}
	}
}

class MetaRedirectInjector {
	constructor({ url }) {
		this.url = url;
	}

	element(element) {
		if (this.url) {
			element.setAttribute('content', `1; URL=${encodeURI(this.url)}`);
		}
	}
}

class MetaDescriptionInjector {
	constructor({ description }) {
		this.description = description || '';
	}

	element(element) {
		element.setAttribute('content', this.description?.replaceAll('\n', ' '));
	}
}

class TitleInjector {
	constructor({ title }) {
		this.title = title || '';
	}

	element(element) {
		element.setInnerContent(this.title);
	}
}

class ScriptRedirectInjector {
	constructor({ url }) {
		this.url = url;
	}

	element(element) {
		element.setInnerContent(`window.location.replace("${encodeURI(this.url)}")`, { html: true });
	}
}

async function renderWidget(data) {
	const remoteUrl = `https://${NearSocialDomain}`;
	return new HTMLRewriter()
		.on('link[rel="icon"]', new FaviconInjector(data))
		.on('head', new WidgetDataInjector(data))
		.on('meta[property="og:title"]', new MetaTitleInjector(data))
		.on('meta[property="og:image"]', new MetaImageInjector(data))
		.on('meta[name="twitter:card"]', new MetaTwitterCardInjector(data))
		.on('meta[property="og:description"]', new MetaDescriptionInjector(data))
		.on('meta[name="description"]', new MetaDescriptionInjector(data))
		.on('title', new TitleInjector(data))
		.transform(await fetch(remoteUrl));
}

async function loadData(accountId, path) {
	path = path.replace(/[^-\w]/g, '');
	const [premiumTime, redirectData] = await Promise.all([
		socialGet(`${PremiumAccountId}/badge/premium/accounts/${accountId}`, undefined, true),
		socialGet(`${accountId}/custom/fm/${path}`, undefined, true),
	]);

	return { isPremium: premiumTime && premiumTime > Date.now(), premiumTime, redirectData };
}

function renderRedirectPage(redirectData) {
	return new HTMLRewriter()
		.on('link[rel="icon"]', new FaviconInjector(redirectData))
		.on('meta[property="og:title"]', new MetaTitleInjector(redirectData))
		.on('meta[property="og:image"]', new MetaImageInjector(redirectData))
		.on('meta[name="twitter:card"]', new MetaTwitterCardInjector(redirectData))
		.on('meta[property="og:description"]', new MetaDescriptionInjector(redirectData))
		.on('meta[name="description"]', new MetaDescriptionInjector(redirectData))
		.on('meta[http-equiv="refresh"]', new MetaRedirectInjector(redirectData))
		.on('title', new TitleInjector(redirectData))
		.on('script', new ScriptRedirectInjector(redirectData))
		.transform(
			new Response(RedirectTemplate, {
				headers: {
					'content-type': 'text/html;charset=UTF-8',
				},
			})
		);
}

async function fetchOgMetadata(url) {
	if (!url) {
		return new Response(JSON.stringify({ error: 'url parameter is missing' }), { status: 400 });
	}
	try {
		const data = {};
		const res = new HTMLRewriter()
			.on('meta[property="og:title"]', {
				element: (e) => {
					data.ogTitle = e.getAttribute('content');
				},
			})
			.on('meta[property="og:image"]', {
				element: (e) => {
					data.ogImage = e.getAttribute('content');
				},
			})
			.on('meta[property="og:description"]', {
				element: (e) => {
					data.ogDescription = e.getAttribute('content');
				},
			})
			.on('meta[name="description"]', {
				element: (e) => {
					data.description = e.getAttribute('content');
				},
			})
			.on('title', {
				element: (e) => {
					data.title = e.getAttribute('content');
				},
			})
			.transform(await fetch(url));
		await res.text();
		return new Response(
			JSON.stringify({
				title: data.ogTitle || data.title || null,
				description: data.ogDescription || data.description || null,
				image: data.ogImage || null,
			}),
			{
				headers: { ...corsHeaders, 'content-type': 'application/json;charset=UTF-8' },
			}
		);
	} catch (error) {
		return new Response(JSON.stringify({ error: 'An error occurred' }), { status: 500 });
	}
}

const corsHeaders = {
	'Access-Control-Allow-Headers': '*', // What headers are allowed. * is wildcard. Instead of using '*', you can specify a list of specific headers that are allowed, such as: Access-Control-Allow-Headers: X-Requested-With, Content-Type, Accept, Authorization.
	'Access-Control-Allow-Methods': 'GET, OPTIONS', // Allowed methods. Others could be GET, PUT, DELETE etc.
	'Access-Control-Allow-Origin': '*', // This is URLs that are allowed to access the server. * is the wildcard character meaning any URL can.
};

export default {
	async fetch(request, env, ctx) {
		const makeCounter = (accountId) => {
			const id = env.COUNTER.idFromName(accountId);
			return env.COUNTER.get(id);
		};

		const incrementRedirect = async (accountId) => {
			const counter = makeCounter(accountId);
			let resp = await counter.fetch(request.url);
			let count = await resp.text();
			console.log('Num redirects', request.url, count);
		};

		if (request.method === 'OPTIONS') {
			return new Response('OK', {
				headers: corsHeaders,
			});
		}

		const url = new URL(request.url);
		if (url.hostname === OurDomain.slice(1)) {
			if (url.pathname === '/api/og') {
				return fetchOgMetadata(url.searchParams.get('url'));
			}
			// if (url.pathname === '/api/count') {
			// 	const accountId = url.searchParams.get('accountId');
			// 	const counter = makeCounter(accountId);
			// 	let resp = await counter.fetch(request.url);
			// 	return fetchOgMetadata(url.searchParams.get('url'));
			// }
			if (url.pathname === '/favicon.png') {
				return Response.redirect(FaviconUrl, 302);
			}
			if (url.pathname.includes('.') || url.pathname.includes('/', 1)) {
				url.hostname = NearSocialDomain;
				return Response.redirect(url.toString(), 302);
			}
			// Display shortener widget without accountId
			return renderWidget({
				widget: DefaultWidget,
				props: {},
				title: Title,
				description: Description,
				image: FaviconUrl,
				favicon: FaviconUrl,
			});
		}
		if (!url.hostname.endsWith(OurDomain)) {
			return new Response(null, {
				status: 404,
			});
		}
		const accountId = url.hostname.slice(0, url.hostname.length - OurDomain.length) + '.near';
		const favicon = `https://i.near.social/magic/thumbnail/https://near.social/magic/img/account/${accountId}`;
		if (url.pathname === '/') {
			// Display shortener widget
			return renderWidget({
				widget: DefaultWidget,
				props: { accountId },
				title: Title,
				description: PersonalDescription,
				image: FaviconUrl,
				favicon,
			});
		} else if (url.pathname.includes('.') || url.pathname.includes('/', 1)) {
			url.hostname = NearSocialDomain;
			return Response.redirect(url.toString(), 302);
		}

		const path = url.pathname.slice(1);
		const { isPremium, premiumTime, redirectData } = await loadData(accountId, path);
		if (redirectData?.url) {
			if (isPremium) {
				await incrementRedirect(accountId, path);
				return renderRedirectPage(Object.assign(redirectData, { favicon }));
			} else if (premiumTime) {
				return renderWidget({ widget: NonPremiumRedirectWidget, props: { accountId, redirectData }, favicon });
			} else {
				// Never been premium
				return renderWidget({
					widget: DefaultWidget,
					props: { accountId, path },
					title: Title,
					description: PersonalDescription,
					image: FaviconUrl,
					favicon,
				});
			}
		} else {
			return renderWidget({ widget: MissingRedirectWidget, props: { accountId, path }, favicon });
		}
	},
};

export class Counter {
	constructor(state, env) {
		this.state = state;
	}

	async fetch(request) {
		const url = new URL(request.url);
		const path = url.pathname.slice(1);
		let value = (await this.state.storage.get(path)) || 0;
		++value;
		await this.state.storage.put(path, value);
		return new Response(value);
	}
}
