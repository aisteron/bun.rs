
Node.prototype.listen = Node.prototype.addEventListener;
export const is_dev = process.env.NODE_ENV == 'development'

export let doc = document,
	qsa = (s, o = doc) => o?.querySelectorAll(s),
	qs = (s, o = doc) => o?.querySelector(s);

function loadCSS(n, e, o, d) { "use strict"; var t = window.document.createElement("link"), i = e || window.document.getElementsByTagName("script")[0], l = window.document.styleSheets; return t.rel = "stylesheet", t.href = n, t.media = "only x", d && (t.onload = d), i.parentNode.insertBefore(t, i), t.onloadcssdefined = function (n) { for (var e, o = 0; o < l.length; o++)l[o].href && l[o].href === t.href && (e = !0); e ? n() : setTimeout(function () { t.onloadcssdefined(n) }) }, t.onloadcssdefined(function () { t.media = o || "all" }), t }

function onloadCSS(n, e) {
	n.onload = function () {
		n.onload = null, e && e.call(n)
	}, "isApplicationInstalled" in navigator && "onloadcssdefined" in n && n.onloadcssdefined(e);
}


export async function load_toast() {

	// https://github.com/joostlawerman/SnackbarLightjs

	// new Snackbar("Hey! Im a snackbar");

	return new Promise(resolve => {
		let script = document.createElement('script')
		script.src = '/assets/vendors/snackbar/snackbarlight.min.js'
		qs('.scripts-area').appendChild(script)
		script.onload = () => {
			let style = loadCSS('/assets/vendors/snackbar/snackbarlight.min.css')
			onloadCSS(style, () => {
				resolve('toast assets loaded')
			})
		}
	})
}
