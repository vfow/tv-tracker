//#region node_modules/@vue/shared/dist/shared.esm-bundler.js
// @__NO_SIDE_EFFECTS__
function e(e) {
	let t = /* @__PURE__ */ Object.create(null);
	for (let n of e.split(",")) t[n] = 1;
	return (e) => e in t;
}
var t = {}, n = [], r = () => {}, i = () => !1, a = (e) => e.charCodeAt(0) === 111 && e.charCodeAt(1) === 110 && (e.charCodeAt(2) > 122 || e.charCodeAt(2) < 97), o = (e) => e.startsWith("onUpdate:"), s = Object.assign, c = (e, t) => {
	let n = e.indexOf(t);
	n > -1 && e.splice(n, 1);
}, l = Object.prototype.hasOwnProperty, u = (e, t) => l.call(e, t), d = Array.isArray, f = (e) => x(e) === "[object Map]", p = (e) => x(e) === "[object Set]", m = (e) => x(e) === "[object Date]", h = (e) => typeof e == "function", g = (e) => typeof e == "string", _ = (e) => typeof e == "symbol", v = (e) => typeof e == "object" && !!e, y = (e) => (v(e) || h(e)) && h(e.then) && h(e.catch), b = Object.prototype.toString, x = (e) => b.call(e), S = (e) => x(e).slice(8, -1), C = (e) => x(e) === "[object Object]", w = (e) => g(e) && e !== "NaN" && e[0] !== "-" && "" + parseInt(e, 10) === e, ee = /* @__PURE__ */ e(",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"), te = (e) => {
	let t = /* @__PURE__ */ Object.create(null);
	return ((n) => t[n] || (t[n] = e(n)));
}, ne = /-\w/g, T = te((e) => e.replace(ne, (e) => e.slice(1).toUpperCase())), re = /\B([A-Z])/g, E = te((e) => e.replace(re, "-$1").toLowerCase()), ie = te((e) => e.charAt(0).toUpperCase() + e.slice(1)), ae = te((e) => e ? `on${ie(e)}` : ""), D = (e, t) => !Object.is(e, t), oe = (e, ...t) => {
	for (let n = 0; n < e.length; n++) e[n](...t);
}, O = (e, t, n, r = !1) => {
	Object.defineProperty(e, t, {
		configurable: !0,
		enumerable: !1,
		writable: r,
		value: n
	});
}, se = (e) => {
	let t = parseFloat(e);
	return isNaN(t) ? e : t;
}, ce, le = () => ce ||= typeof globalThis < "u" ? globalThis : typeof self < "u" ? self : typeof window < "u" ? window : typeof global < "u" ? global : {};
function ue(e) {
	if (d(e)) {
		let t = {};
		for (let n = 0; n < e.length; n++) {
			let r = e[n], i = g(r) ? me(r) : ue(r);
			if (i) for (let e in i) t[e] = i[e];
		}
		return t;
	}
	if (g(e) || v(e)) return e;
}
var de = /;(?![^(]*\))/g, fe = /:([^]+)/, pe = /\/\*[^]*?\*\//g;
function me(e) {
	let t = {};
	return e.replace(pe, "").split(de).forEach((e) => {
		if (e) {
			let n = e.split(fe);
			n.length > 1 && (t[n[0].trim()] = n[1].trim());
		}
	}), t;
}
function k(e) {
	let t = "";
	if (g(e)) t = e;
	else if (d(e)) for (let n = 0; n < e.length; n++) {
		let r = k(e[n]);
		r && (t += r + " ");
	}
	else if (v(e)) for (let n in e) e[n] && (t += n + " ");
	return t.trim();
}
var he = "itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly", ge = /* @__PURE__ */ e(he);
he + "";
function _e(e) {
	return !!e || e === "";
}
function ve(e, t) {
	if (e.length !== t.length) return !1;
	let n = !0;
	for (let r = 0; n && r < e.length; r++) n = ye(e[r], t[r]);
	return n;
}
function ye(e, t) {
	if (e === t) return !0;
	let n = m(e), r = m(t);
	if (n || r) return n && r ? e.getTime() === t.getTime() : !1;
	if (n = _(e), r = _(t), n || r) return e === t;
	if (n = d(e), r = d(t), n || r) return n && r ? ve(e, t) : !1;
	if (n = v(e), r = v(t), n || r) {
		if (!n || !r || Object.keys(e).length !== Object.keys(t).length) return !1;
		for (let n in e) {
			let r = e.hasOwnProperty(n), i = t.hasOwnProperty(n);
			if (r && !i || !r && i || !ye(e[n], t[n])) return !1;
		}
	}
	return String(e) === String(t);
}
//#endregion
//#region node_modules/@vue/reactivity/dist/reactivity.esm-bundler.js
var A, be = class {
	constructor(e = !1) {
		this.detached = e, this._active = !0, this._on = 0, this.effects = [], this.cleanups = [], this._isPaused = !1, this._warnOnRun = !0, this.__v_skip = !0, !e && A && (A.active ? (this.parent = A, this.index = (A.scopes || (A.scopes = [])).push(this) - 1) : (this._active = !1, this._warnOnRun = !1));
	}
	get active() {
		return this._active;
	}
	pause() {
		if (this._active) {
			this._isPaused = !0;
			let e, t;
			if (this.scopes) {
				let n = this.scopes.slice();
				for (e = 0, t = n.length; e < t; e++) n[e].pause();
			}
			for (e = 0, t = this.effects.length; e < t; e++) this.effects[e].pause();
		}
	}
	resume() {
		if (this._active && this._isPaused) {
			this._isPaused = !1;
			let e, t;
			if (this.scopes) {
				let n = this.scopes.slice();
				for (e = 0, t = n.length; e < t; e++) n[e].resume();
			}
			let n = this.effects.slice();
			for (e = 0, t = n.length; e < t; e++) n[e].resume();
		}
	}
	run(e) {
		if (this._active) {
			let t = A;
			try {
				return A = this, e();
			} finally {
				A = t;
			}
		}
	}
	on() {
		++this._on === 1 && (this.prevScope = A, A = this);
	}
	off() {
		if (this._on > 0 && --this._on === 0) {
			if (A === this) A = this.prevScope;
			else {
				let e = A;
				for (; e;) {
					if (e.prevScope === this) {
						e.prevScope = this.prevScope;
						break;
					}
					e = e.prevScope;
				}
			}
			this.prevScope = void 0;
		}
	}
	stop(e) {
		if (this._active) {
			this._active = !1;
			let t, n;
			for (t = 0, n = this.effects.length; t < n; t++) this.effects[t].stop();
			for (this.effects.length = 0, t = 0, n = this.cleanups.length; t < n; t++) this.cleanups[t]();
			if (this.cleanups.length = 0, this.scopes) {
				let e = this.scopes.slice();
				for (t = 0, n = e.length; t < n; t++) e[t].stop(!0);
				this.scopes.length = 0;
			}
			if (!this.detached && this.parent && !e) {
				let e = this.parent.scopes.pop();
				e && e !== this && (this.parent.scopes[this.index] = e, e.index = this.index);
			}
			this.parent = void 0;
		}
	}
};
function xe() {
	return A;
}
var j, Se = /* @__PURE__ */ new WeakSet(), Ce = class {
	constructor(e) {
		this.fn = e, this.deps = void 0, this.depsTail = void 0, this.flags = 5, this.next = void 0, this.cleanup = void 0, this.scheduler = void 0, A && (A.active ? A.effects.push(this) : this.flags &= -2);
	}
	pause() {
		this.flags |= 64;
	}
	resume() {
		this.flags & 64 && (this.flags &= -65, Se.has(this) && (Se.delete(this), this.trigger()));
	}
	notify() {
		this.flags & 2 && !(this.flags & 32) || this.flags & 8 || De(this);
	}
	run() {
		if (!(this.flags & 1)) return this.fn();
		this.flags |= 2, Re(this), Ae(this);
		let e = j, t = M;
		j = this, M = !0;
		try {
			return this.fn();
		} finally {
			je(this), j = e, M = t, this.flags &= -3;
		}
	}
	stop() {
		if (this.flags & 1) {
			for (let e = this.deps; e; e = e.nextDep) Pe(e);
			this.deps = this.depsTail = void 0, Re(this), this.onStop && this.onStop(), this.flags &= -2;
		}
	}
	trigger() {
		this.flags & 64 ? Se.add(this) : this.scheduler ? this.scheduler() : this.runIfDirty();
	}
	runIfDirty() {
		Me(this) && this.run();
	}
	get dirty() {
		return Me(this);
	}
}, we = 0, Te, Ee;
function De(e, t = !1) {
	if (e.flags |= 8, t) {
		e.next = Ee, Ee = e;
		return;
	}
	e.next = Te, Te = e;
}
function Oe() {
	we++;
}
function ke() {
	if (--we > 0) return;
	if (Ee) {
		let e = Ee;
		for (Ee = void 0; e;) {
			let t = e.next;
			e.next = void 0, e.flags &= -9, e = t;
		}
	}
	let e;
	for (; Te;) {
		let t = Te;
		for (Te = void 0; t;) {
			let n = t.next;
			if (t.next = void 0, t.flags &= -9, t.flags & 1) try {
				t.trigger();
			} catch (t) {
				e ||= t;
			}
			t = n;
		}
	}
	if (e) throw e;
}
function Ae(e) {
	for (let t = e.deps; t; t = t.nextDep) t.version = -1, t.prevActiveLink = t.dep.activeLink, t.dep.activeLink = t;
}
function je(e) {
	let t, n = e.depsTail, r = n;
	for (; r;) {
		let e = r.prevDep;
		r.version === -1 ? (r === n && (n = e), Pe(r), Fe(r)) : t = r, r.dep.activeLink = r.prevActiveLink, r.prevActiveLink = void 0, r = e;
	}
	e.deps = t, e.depsTail = n;
}
function Me(e) {
	for (let t = e.deps; t; t = t.nextDep) if (t.dep.version !== t.version || t.dep.computed && (Ne(t.dep.computed) || t.dep.version !== t.version)) return !0;
	return !!e._dirty;
}
function Ne(e) {
	if (e.flags & 4 && !(e.flags & 16) || (e.flags &= -17, e.globalVersion === ze) || (e.globalVersion = ze, !e.isSSR && e.flags & 128 && (!e.deps && !e._dirty || !Me(e)))) return;
	e.flags |= 2;
	let t = e.dep, n = j, r = M;
	j = e, M = !0;
	try {
		Ae(e);
		let n = e.fn(e._value);
		(t.version === 0 || D(n, e._value)) && (e.flags |= 128, e._value = n, t.version++);
	} catch (e) {
		throw t.version++, e;
	} finally {
		j = n, M = r, je(e), e.flags &= -3;
	}
}
function Pe(e, t = !1) {
	let { dep: n, prevSub: r, nextSub: i } = e;
	if (r && (r.nextSub = i, e.prevSub = void 0), i && (i.prevSub = r, e.nextSub = void 0), n.subs === e && (n.subs = r, !r && n.computed)) {
		n.computed.flags &= -5;
		for (let e = n.computed.deps; e; e = e.nextDep) Pe(e, !0);
	}
	!t && !--n.sc && n.map && n.map.delete(n.key);
}
function Fe(e) {
	let { prevDep: t, nextDep: n } = e;
	t && (t.nextDep = n, e.prevDep = void 0), n && (n.prevDep = t, e.nextDep = void 0);
}
var M = !0, Ie = [];
function N() {
	Ie.push(M), M = !1;
}
function Le() {
	let e = Ie.pop();
	M = e === void 0 || e;
}
function Re(e) {
	let { cleanup: t } = e;
	if (e.cleanup = void 0, t) {
		let e = j;
		j = void 0;
		try {
			t();
		} finally {
			j = e;
		}
	}
}
var ze = 0, Be = class {
	constructor(e, t) {
		this.sub = e, this.dep = t, this.version = t.version, this.nextDep = this.prevDep = this.nextSub = this.prevSub = this.prevActiveLink = void 0;
	}
}, Ve = class {
	constructor(e) {
		this.computed = e, this.version = 0, this.activeLink = void 0, this.subs = void 0, this.map = void 0, this.key = void 0, this.sc = 0, this.__v_skip = !0;
	}
	track(e) {
		if (!j || !M || j === this.computed) return;
		let t = this.activeLink;
		if (t === void 0 || t.sub !== j) t = this.activeLink = new Be(j, this), j.deps ? (t.prevDep = j.depsTail, j.depsTail.nextDep = t, j.depsTail = t) : j.deps = j.depsTail = t, He(t);
		else if (t.version === -1 && (t.version = this.version, t.nextDep)) {
			let e = t.nextDep;
			e.prevDep = t.prevDep, t.prevDep && (t.prevDep.nextDep = e), t.prevDep = j.depsTail, t.nextDep = void 0, j.depsTail.nextDep = t, j.depsTail = t, j.deps === t && (j.deps = e);
		}
		return t;
	}
	trigger(e) {
		this.version++, ze++, this.notify(e);
	}
	notify(e) {
		Oe();
		try {
			for (let e = this.subs; e; e = e.prevSub) e.sub.notify() && e.sub.dep.notify();
		} finally {
			ke();
		}
	}
};
function He(e) {
	if (e.dep.sc++, e.sub.flags & 4) {
		let t = e.dep.computed;
		if (t && !e.dep.subs) {
			t.flags |= 20;
			for (let e = t.deps; e; e = e.nextDep) He(e);
		}
		let n = e.dep.subs;
		n !== e && (e.prevSub = n, n && (n.nextSub = e)), e.dep.subs = e;
	}
}
var Ue = /* @__PURE__ */ new WeakMap(), We = /* @__PURE__ */ Symbol(""), Ge = /* @__PURE__ */ Symbol(""), Ke = /* @__PURE__ */ Symbol("");
function P(e, t, n) {
	if (M && j) {
		let t = Ue.get(e);
		t || Ue.set(e, t = /* @__PURE__ */ new Map());
		let r = t.get(n);
		r || (t.set(n, r = new Ve()), r.map = t, r.key = n), r.track();
	}
}
function qe(e, t, n, r, i, a) {
	let o = Ue.get(e);
	if (!o) {
		ze++;
		return;
	}
	let s = (e) => {
		e && e.trigger();
	};
	if (Oe(), t === "clear") o.forEach(s);
	else {
		let i = d(e), a = i && w(n);
		if (i && n === "length") {
			let e = Number(r);
			o.forEach((t, n) => {
				(n === "length" || n === Ke || !_(n) && n >= e) && s(t);
			});
		} else switch ((n !== void 0 || o.has(void 0)) && s(o.get(n)), a && s(o.get(Ke)), t) {
			case "add":
				i ? a && s(o.get("length")) : (s(o.get(We)), f(e) && s(o.get(Ge)));
				break;
			case "delete":
				i || (s(o.get(We)), f(e) && s(o.get(Ge)));
				break;
			case "set": f(e) && s(o.get(We));
		}
	}
	ke();
}
function Je(e) {
	let t = /* @__PURE__ */ R(e);
	return t === e ? t : (P(t, "iterate", Ke), /* @__PURE__ */ L(e) ? t : t.map(Nt));
}
function Ye(e) {
	return P(e = /* @__PURE__ */ R(e), "iterate", Ke), e;
}
function F(e, t) {
	return /* @__PURE__ */ At(e) ? Pt(/* @__PURE__ */ kt(e) ? Nt(t) : t) : Nt(t);
}
var Xe = {
	__proto__: null,
	[Symbol.iterator]() {
		return Ze(this, Symbol.iterator, (e) => F(this, e));
	},
	concat(...e) {
		return Je(this).concat(...e.map((e) => d(e) ? Je(e) : e));
	},
	entries() {
		return Ze(this, "entries", (e) => (e[1] = F(this, e[1]), e));
	},
	every(e, t) {
		return I(this, "every", e, t, void 0, arguments);
	},
	filter(e, t) {
		return I(this, "filter", e, t, (e) => e.map((e) => F(this, e)), arguments);
	},
	find(e, t) {
		return I(this, "find", e, t, (e) => F(this, e), arguments);
	},
	findIndex(e, t) {
		return I(this, "findIndex", e, t, void 0, arguments);
	},
	findLast(e, t) {
		return I(this, "findLast", e, t, (e) => F(this, e), arguments);
	},
	findLastIndex(e, t) {
		return I(this, "findLastIndex", e, t, void 0, arguments);
	},
	forEach(e, t) {
		return I(this, "forEach", e, t, void 0, arguments);
	},
	includes(...e) {
		return et(this, "includes", e);
	},
	indexOf(...e) {
		return et(this, "indexOf", e);
	},
	join(e) {
		return Je(this).join(e);
	},
	lastIndexOf(...e) {
		return et(this, "lastIndexOf", e);
	},
	map(e, t) {
		return I(this, "map", e, t, void 0, arguments);
	},
	pop() {
		return tt(this, "pop");
	},
	push(...e) {
		return tt(this, "push", e);
	},
	reduce(e, ...t) {
		return $e(this, "reduce", e, t);
	},
	reduceRight(e, ...t) {
		return $e(this, "reduceRight", e, t);
	},
	shift() {
		return tt(this, "shift");
	},
	some(e, t) {
		return I(this, "some", e, t, void 0, arguments);
	},
	splice(...e) {
		return tt(this, "splice", e);
	},
	toReversed() {
		return Je(this).toReversed();
	},
	toSorted(e) {
		return Je(this).toSorted(e);
	},
	toSpliced(...e) {
		return Je(this).toSpliced(...e);
	},
	unshift(...e) {
		return tt(this, "unshift", e);
	},
	values() {
		return Ze(this, "values", (e) => F(this, e));
	}
};
function Ze(e, t, n) {
	let r = Ye(e), i = r[t]();
	return r !== e && !/* @__PURE__ */ L(e) && (i._next = i.next, i.next = () => {
		let e = i._next();
		return e.done || (e.value = n(e.value)), e;
	}), i;
}
var Qe = Array.prototype;
function I(e, t, n, r, i, a) {
	let o = Ye(e), s = o !== e && !/* @__PURE__ */ L(e), c = o[t];
	if (c !== Qe[t]) {
		let t = c.apply(e, a);
		return s ? Nt(t) : t;
	}
	let l = n;
	o !== e && (s ? l = function(t, r) {
		return n.call(this, F(e, t), r, e);
	} : n.length > 2 && (l = function(t, r) {
		return n.call(this, t, r, e);
	}));
	let u = c.call(o, l, r);
	return s && i ? i(u) : u;
}
function $e(e, t, n, r) {
	let i = Ye(e), a = i !== e && !/* @__PURE__ */ L(e), o = n, s = !1;
	i !== e && (a ? (s = r.length === 0, o = function(t, r, i) {
		return s && (s = !1, t = F(e, t)), n.call(this, t, F(e, r), i, e);
	}) : n.length > 3 && (o = function(t, r, i) {
		return n.call(this, t, r, i, e);
	}));
	let c = i[t](o, ...r);
	return s ? F(e, c) : c;
}
function et(e, t, n) {
	let r = /* @__PURE__ */ R(e);
	P(r, "iterate", Ke);
	let i = r[t](...n);
	return (i === -1 || i === !1) && /* @__PURE__ */ jt(n[0]) ? (n[0] = /* @__PURE__ */ R(n[0]), r[t](...n)) : i;
}
function tt(e, t, n = []) {
	N(), Oe();
	let r = (/* @__PURE__ */ R(e))[t].apply(e, n);
	return ke(), Le(), r;
}
var nt = /* @__PURE__ */ e("__proto__,__v_isRef,__isVue"), rt = new Set(/* @__PURE__ */ Object.getOwnPropertyNames(Symbol).filter((e) => e !== "arguments" && e !== "caller").map((e) => Symbol[e]).filter(_));
function it(e) {
	_(e) || (e = String(e));
	let t = /* @__PURE__ */ R(this);
	return P(t, "has", e), t.hasOwnProperty(e);
}
var at = class {
	constructor(e = !1, t = !1) {
		this._isReadonly = e, this._isShallow = t;
	}
	get(e, t, n) {
		if (t === "__v_skip") return e.__v_skip;
		let r = this._isReadonly, i = this._isShallow;
		if (t === "__v_isReactive") return !r;
		if (t === "__v_isReadonly") return r;
		if (t === "__v_isShallow") return i;
		if (t === "__v_raw") return n === (r ? i ? Ct : St : i ? xt : bt).get(e) || Object.getPrototypeOf(e) === Object.getPrototypeOf(n) ? e : void 0;
		let a = d(e);
		if (!r) {
			let e;
			if (a && (e = Xe[t])) return e;
			if (t === "hasOwnProperty") return it;
		}
		let o = Reflect.get(e, t, /* @__PURE__ */ z(e) ? e : n);
		if ((_(t) ? rt.has(t) : nt(t)) || (r || P(e, "get", t), i)) return o;
		if (/* @__PURE__ */ z(o)) {
			let e = a && w(t) ? o : o.value;
			return r && v(e) ? /* @__PURE__ */ Dt(e) : e;
		}
		return v(o) ? r ? /* @__PURE__ */ Dt(o) : /* @__PURE__ */ Tt(o) : o;
	}
}, ot = class extends at {
	constructor(e = !1) {
		super(!1, e);
	}
	set(e, t, n, r) {
		let i = e[t], a = d(e) && w(t);
		if (!this._isShallow) {
			let e = /* @__PURE__ */ At(i);
			if (!/* @__PURE__ */ L(n) && !/* @__PURE__ */ At(n) && (i = /* @__PURE__ */ R(i), n = /* @__PURE__ */ R(n)), !a && /* @__PURE__ */ z(i) && !/* @__PURE__ */ z(n)) return e || (i.value = n), !0;
		}
		let o = a ? Number(t) < e.length : u(e, t), s = Reflect.set(e, t, n, /* @__PURE__ */ z(e) ? e : r);
		return e === /* @__PURE__ */ R(r) && s && (o ? D(n, i) && qe(e, "set", t, n, i) : qe(e, "add", t, n)), s;
	}
	deleteProperty(e, t) {
		let n = u(e, t), r = e[t], i = Reflect.deleteProperty(e, t);
		return i && n && qe(e, "delete", t, void 0, r), i;
	}
	has(e, t) {
		let n = Reflect.has(e, t);
		return (!_(t) || !rt.has(t)) && P(e, "has", t), n;
	}
	ownKeys(e) {
		return P(e, "iterate", d(e) ? "length" : We), Reflect.ownKeys(e);
	}
}, st = class extends at {
	constructor(e = !1) {
		super(!0, e);
	}
	set(e, t) {
		return !0;
	}
	deleteProperty(e, t) {
		return !0;
	}
}, ct = /* @__PURE__ */ new ot(), lt = /* @__PURE__ */ new st(), ut = /* @__PURE__ */ new ot(!0), dt = (e) => e, ft = (e) => Reflect.getPrototypeOf(e);
function pt(e, t, n) {
	return function(...r) {
		let i = this.__v_raw, a = /* @__PURE__ */ R(i), o = f(a), c = e === "entries" || e === Symbol.iterator && o, l = e === "keys" && o, u = i[e](...r), d = n ? dt : t ? Pt : Nt;
		return !t && P(a, "iterate", l ? Ge : We), s(Object.create(u), { next() {
			let { value: e, done: t } = u.next();
			return t ? {
				value: e,
				done: t
			} : {
				value: c ? [d(e[0]), d(e[1])] : d(e),
				done: t
			};
		} });
	};
}
function mt(e) {
	return function(...t) {
		return e === "delete" ? !1 : e === "clear" ? void 0 : this;
	};
}
function ht(e, t) {
	let n = {
		get(n) {
			let r = this.__v_raw, i = /* @__PURE__ */ R(r), a = /* @__PURE__ */ R(n);
			e || (D(n, a) && P(i, "get", n), P(i, "get", a));
			let { has: o } = ft(i), s = t ? dt : e ? Pt : Nt;
			if (o.call(i, n)) return s(r.get(n));
			if (o.call(i, a)) return s(r.get(a));
			r !== i && r.get(n);
		},
		get size() {
			let t = this.__v_raw;
			return !e && P(/* @__PURE__ */ R(t), "iterate", We), t.size;
		},
		has(t) {
			let n = this.__v_raw, r = /* @__PURE__ */ R(n), i = /* @__PURE__ */ R(t);
			return e || (D(t, i) && P(r, "has", t), P(r, "has", i)), t === i ? n.has(t) : n.has(t) || n.has(i);
		},
		forEach(n, r) {
			let i = this, a = i.__v_raw, o = /* @__PURE__ */ R(a), s = t ? dt : e ? Pt : Nt;
			return !e && P(o, "iterate", We), a.forEach((e, t) => n.call(r, s(e), s(t), i));
		}
	};
	return s(n, e ? {
		add: mt("add"),
		set: mt("set"),
		delete: mt("delete"),
		clear: mt("clear")
	} : {
		add(e) {
			let n = /* @__PURE__ */ R(this), r = ft(n), i = /* @__PURE__ */ R(e), a = !t && !/* @__PURE__ */ L(e) && !/* @__PURE__ */ At(e) ? i : e;
			return r.has.call(n, a) || D(e, a) && r.has.call(n, e) || D(i, a) && r.has.call(n, i) || (n.add(a), qe(n, "add", a, a)), this;
		},
		set(e, n) {
			!t && !/* @__PURE__ */ L(n) && !/* @__PURE__ */ At(n) && (n = /* @__PURE__ */ R(n));
			let r = /* @__PURE__ */ R(this), { has: i, get: a } = ft(r), o = i.call(r, e);
			o ||= (e = /* @__PURE__ */ R(e), i.call(r, e));
			let s = a.call(r, e);
			return r.set(e, n), o ? D(n, s) && qe(r, "set", e, n, s) : qe(r, "add", e, n), this;
		},
		delete(e) {
			let t = /* @__PURE__ */ R(this), { has: n, get: r } = ft(t), i = n.call(t, e);
			i ||= (e = /* @__PURE__ */ R(e), n.call(t, e));
			let a = r ? r.call(t, e) : void 0, o = t.delete(e);
			return i && qe(t, "delete", e, void 0, a), o;
		},
		clear() {
			let e = /* @__PURE__ */ R(this), t = e.size !== 0, n = e.clear();
			return t && qe(e, "clear", void 0, void 0, void 0), n;
		}
	}), [
		"keys",
		"values",
		"entries",
		Symbol.iterator
	].forEach((r) => {
		n[r] = pt(r, e, t);
	}), n;
}
function gt(e, t) {
	let n = ht(e, t);
	return (t, r, i) => r === "__v_isReactive" ? !e : r === "__v_isReadonly" ? e : r === "__v_raw" ? t : Reflect.get(u(n, r) && r in t ? n : t, r, i);
}
var _t = { get: /* @__PURE__ */ gt(!1, !1) }, vt = { get: /* @__PURE__ */ gt(!1, !0) }, yt = { get: /* @__PURE__ */ gt(!0, !1) }, bt = /* @__PURE__ */ new WeakMap(), xt = /* @__PURE__ */ new WeakMap(), St = /* @__PURE__ */ new WeakMap(), Ct = /* @__PURE__ */ new WeakMap();
function wt(e) {
	switch (e) {
		case "Object":
		case "Array": return 1;
		case "Map":
		case "Set":
		case "WeakMap":
		case "WeakSet": return 2;
		default: return 0;
	}
}
// @__NO_SIDE_EFFECTS__
function Tt(e) {
	return /* @__PURE__ */ At(e) ? e : Ot(e, !1, ct, _t, bt);
}
// @__NO_SIDE_EFFECTS__
function Et(e) {
	return Ot(e, !1, ut, vt, xt);
}
// @__NO_SIDE_EFFECTS__
function Dt(e) {
	return Ot(e, !0, lt, yt, St);
}
function Ot(e, t, n, r, i) {
	if (!v(e) || e.__v_raw && !(t && e.__v_isReactive) || e.__v_skip || !Object.isExtensible(e)) return e;
	let a = i.get(e);
	if (a) return a;
	let o = wt(S(e));
	if (o === 0) return e;
	let s = new Proxy(e, o === 2 ? r : n);
	return i.set(e, s), s;
}
// @__NO_SIDE_EFFECTS__
function kt(e) {
	return /* @__PURE__ */ At(e) ? /* @__PURE__ */ kt(e.__v_raw) : !!(e && e.__v_isReactive);
}
// @__NO_SIDE_EFFECTS__
function At(e) {
	return !!(e && e.__v_isReadonly);
}
// @__NO_SIDE_EFFECTS__
function L(e) {
	return !!(e && e.__v_isShallow);
}
// @__NO_SIDE_EFFECTS__
function jt(e) {
	return e ? !!e.__v_raw : !1;
}
// @__NO_SIDE_EFFECTS__
function R(e) {
	let t = e && e.__v_raw;
	return t ? /* @__PURE__ */ R(t) : e;
}
function Mt(e) {
	return !u(e, "__v_skip") && Object.isExtensible(e) && O(e, "__v_skip", !0), e;
}
var Nt = (e) => v(e) ? /* @__PURE__ */ Tt(e) : e, Pt = (e) => v(e) ? /* @__PURE__ */ Dt(e) : e;
// @__NO_SIDE_EFFECTS__
function z(e) {
	return e ? e.__v_isRef === !0 : !1;
}
function Ft(e) {
	return /* @__PURE__ */ z(e) ? e.value : e;
}
var It = {
	get: (e, t, n) => t === "__v_raw" ? e : Ft(Reflect.get(e, t, n)),
	set: (e, t, n, r) => {
		let i = e[t];
		return /* @__PURE__ */ z(i) && !/* @__PURE__ */ z(n) ? (i.value = n, !0) : Reflect.set(e, t, n, r);
	}
};
function Lt(e) {
	return /* @__PURE__ */ kt(e) ? e : new Proxy(e, It);
}
var Rt = class {
	constructor(e, t, n) {
		this.fn = e, this.setter = t, this._value = void 0, this.dep = new Ve(this), this.__v_isRef = !0, this.deps = void 0, this.depsTail = void 0, this.flags = 16, this.globalVersion = ze - 1, this.next = void 0, this.effect = this, this.__v_isReadonly = !t, this.isSSR = n;
	}
	notify() {
		if (this.flags |= 16, !(this.flags & 8) && j !== this) return De(this, !0), !0;
	}
	get value() {
		let e = this.dep.track();
		return Ne(this), e && (e.version = this.dep.version), this._value;
	}
	set value(e) {
		this.setter && this.setter(e);
	}
};
// @__NO_SIDE_EFFECTS__
function zt(e, t, n = !1) {
	let r, i;
	return h(e) ? r = e : (r = e.get, i = e.set), new Rt(r, i, n);
}
var Bt = {}, Vt = /* @__PURE__ */ new WeakMap(), Ht = void 0;
function Ut(e, t = !1, n = Ht) {
	if (n) {
		let t = Vt.get(n);
		t || Vt.set(n, t = []), t.push(e);
	}
}
function Wt(e, n, i = t) {
	let { immediate: a, deep: o, once: s, scheduler: l, augmentJob: u, call: f } = i, p = (e) => o ? e : /* @__PURE__ */ L(e) || o === !1 || o === 0 ? Gt(e, 1) : Gt(e), m, g, _, v, y = !1, b = !1;
	if (/* @__PURE__ */ z(e) ? (g = () => e.value, y = /* @__PURE__ */ L(e)) : /* @__PURE__ */ kt(e) ? (g = () => p(e), y = !0) : d(e) ? (b = !0, y = e.some((e) => /* @__PURE__ */ kt(e) || /* @__PURE__ */ L(e)), g = () => e.map((e) => {
		if (/* @__PURE__ */ z(e)) return e.value;
		if (/* @__PURE__ */ kt(e)) return p(e);
		if (h(e)) return f ? f(e, 2) : e();
	})) : g = h(e) ? n ? f ? () => f(e, 2) : e : () => {
		if (_) {
			N();
			try {
				_();
			} finally {
				Le();
			}
		}
		let t = Ht;
		Ht = m;
		try {
			return f ? f(e, 3, [v]) : e(v);
		} finally {
			Ht = t;
		}
	} : r, n && o) {
		let e = g, t = o === !0 ? Infinity : o;
		g = () => Gt(e(), t);
	}
	let x = xe(), S = () => {
		m.stop(), x && x.active && c(x.effects, m);
	};
	if (s && n) {
		let e = n;
		n = (...t) => {
			let n = e(...t);
			return S(), n;
		};
	}
	let C = b ? Array(e.length).fill(Bt) : Bt, w = (e) => {
		if (!(!(m.flags & 1) || !m.dirty && !e)) {
			if (n) {
				let t = m.run();
				if (e || o || y || (b ? t.some((e, t) => D(e, C[t])) : D(t, C))) {
					_ && _();
					let e = Ht;
					Ht = m;
					try {
						let e = [
							t,
							C === Bt ? void 0 : b && C[0] === Bt ? [] : C,
							v
						];
						C = t, f ? f(n, 3, e) : n(...e);
					} finally {
						Ht = e;
					}
				}
			} else m.run();
		}
	};
	return u && u(w), m = new Ce(g), m.scheduler = l ? () => l(w, !1) : w, v = (e) => Ut(e, !1, m), _ = m.onStop = () => {
		let e = Vt.get(m);
		if (e) {
			if (f) f(e, 4);
			else for (let t of e) t();
			Vt.delete(m);
		}
	}, n ? a ? w(!0) : C = m.run() : l ? l(w.bind(null, !0), !0) : m.run(), S.pause = m.pause.bind(m), S.resume = m.resume.bind(m), S.stop = S, S;
}
function Gt(e, t = Infinity, n) {
	if (t <= 0 || !v(e) || e.__v_skip || (n ||= /* @__PURE__ */ new Map(), (n.get(e) || 0) >= t)) return e;
	if (n.set(e, t), t--, /* @__PURE__ */ z(e)) Gt(e.value, t, n);
	else if (d(e)) for (let r = 0; r < e.length; r++) Gt(e[r], t, n);
	else if (p(e) || f(e)) e.forEach((e) => {
		Gt(e, t, n);
	});
	else if (C(e)) {
		for (let r in e) Gt(e[r], t, n);
		for (let r of Object.getOwnPropertySymbols(e)) Object.prototype.propertyIsEnumerable.call(e, r) && Gt(e[r], t, n);
	}
	return e;
}
//#endregion
//#region node_modules/@vue/runtime-core/dist/runtime-core.esm-bundler.js
function Kt(e, t, n, r) {
	try {
		return r ? e(...r) : e();
	} catch (e) {
		qt(e, t, n);
	}
}
function B(e, t, n, r) {
	if (h(e)) {
		let i = Kt(e, t, n, r);
		return i && y(i) && i.catch((e) => {
			qt(e, t, n);
		}), i;
	}
	if (d(e)) {
		let i = [];
		for (let a = 0; a < e.length; a++) i.push(B(e[a], t, n, r));
		return i;
	}
}
function qt(e, n, r, i = !0) {
	let a = n ? n.vnode : null, { errorHandler: o, throwUnhandledErrorInProduction: s } = n && n.appContext.config || t;
	if (n) {
		let t = n.parent, i = n.proxy, a = `https://vuejs.org/error-reference/#runtime-${r}`;
		for (; t;) {
			let n = t.ec;
			if (n) {
				for (let t = 0; t < n.length; t++) if (n[t](e, i, a) === !1) return;
			}
			t = t.parent;
		}
		if (o) {
			N(), Kt(o, null, 10, [
				e,
				i,
				a
			]), Le();
			return;
		}
	}
	Jt(e, r, a, i, s);
}
function Jt(e, t, n, r = !0, i = !1) {
	if (i) throw e;
	console.error(e);
}
var V = [], H = -1, Yt = [], Xt = null, Zt = 0, Qt = /* @__PURE__ */ Promise.resolve(), $t = null;
function en(e) {
	let t = $t || Qt;
	return e ? t.then(this ? e.bind(this) : e) : t;
}
function tn(e) {
	let t = H + 1, n = V.length;
	for (; t < n;) {
		let r = t + n >>> 1, i = V[r], a = cn(i);
		a < e || a === e && i.flags & 2 ? t = r + 1 : n = r;
	}
	return t;
}
function nn(e) {
	if (!(e.flags & 1)) {
		let t = cn(e), n = V[V.length - 1];
		!n || !(e.flags & 2) && t >= cn(n) ? V.push(e) : V.splice(tn(t), 0, e), e.flags |= 1, rn();
	}
}
function rn() {
	$t ||= Qt.then(ln);
}
function an(e) {
	d(e) ? Yt.push(...e) : Xt && e.id === -1 ? Xt.splice(Zt + 1, 0, e) : e.flags & 1 || (Yt.push(e), e.flags |= 1), rn();
}
function on(e, t, n = H + 1) {
	for (; n < V.length; n++) {
		let t = V[n];
		if (t && t.flags & 2) {
			if (e && t.id !== e.uid) continue;
			V.splice(n, 1), n--, t.flags & 4 && (t.flags &= -2), t(), t.flags & 4 || (t.flags &= -2);
		}
	}
}
function sn(e) {
	if (Yt.length) {
		let e = [...new Set(Yt)].sort((e, t) => cn(e) - cn(t));
		if (Yt.length = 0, Xt) {
			Xt.push(...e);
			return;
		}
		for (Xt = e, Zt = 0; Zt < Xt.length; Zt++) {
			let e = Xt[Zt];
			e.flags & 4 && (e.flags &= -2), e.flags & 8 || e(), e.flags &= -2;
		}
		Xt = null, Zt = 0;
	}
}
var cn = (e) => e.id == null ? e.flags & 2 ? -1 : Infinity : e.id;
function ln(e) {
	try {
		for (H = 0; H < V.length; H++) {
			let e = V[H];
			e && !(e.flags & 8) && (e.flags & 4 && (e.flags &= -2), Kt(e, e.i, e.i ? 15 : 14), e.flags & 4 || (e.flags &= -2));
		}
	} finally {
		for (; H < V.length; H++) {
			let e = V[H];
			e && (e.flags &= -2);
		}
		H = -1, V.length = 0, sn(e), $t = null, (V.length || Yt.length) && ln(e);
	}
}
var U = null, un = null;
function dn(e) {
	let t = U;
	return U = e, un = e && e.type.__scopeId || null, t;
}
function fn(e, t = U, n) {
	if (!t || e._n) return e;
	let r = (...n) => {
		r._d && pi(-1);
		let i = dn(t), a = ui.length, o;
		try {
			o = e(...n);
		} finally {
			for (let e = ui.length; e > a; e--) di();
			dn(i), r._d && pi(1);
		}
		return o;
	};
	return r._n = !0, r._c = !0, r._d = !0, r;
}
function pn(e, t, n, r) {
	let i = e.dirs, a = t && t.dirs;
	for (let o = 0; o < i.length; o++) {
		let s = i[o];
		a && (s.oldValue = a[o].value);
		let c = s.dir[r];
		c && (N(), B(c, n, 8, [
			e.el,
			s,
			e,
			t
		]), Le());
	}
}
function mn(e, t) {
	if (Q) {
		let n = Q.provides, r = Q.parent && Q.parent.provides;
		r === n && (n = Q.provides = Object.create(r)), n[e] = t;
	}
}
function hn(e, t, n = !1) {
	let r = ki();
	if (r || vr) {
		let i = vr ? vr._context.provides : r ? r.parent == null || r.ce ? r.vnode.appContext && r.vnode.appContext.provides : r.parent.provides : void 0;
		if (i && e in i) return i[e];
		if (arguments.length > 1) return n && h(t) ? t.call(r && r.proxy) : t;
	}
}
var gn = /* @__PURE__ */ Symbol.for("v-scx"), _n = () => hn(gn);
function vn(e, t, n) {
	return yn(e, t, n);
}
function yn(e, n, i = t) {
	let { immediate: a, deep: o, flush: c, once: l } = i, u = s({}, i), d = n && a || !n && c !== "post", f;
	if (Fi) {
		if (c === "sync") {
			let e = _n();
			f = e.__watcherHandles ||= [];
		} else if (!d) {
			let e = () => {};
			return e.stop = r, e.resume = r, e.pause = r, e;
		}
	}
	let p = Q;
	u.call = (e, t, n) => B(e, p, t, n);
	let m = !1;
	c === "post" ? u.scheduler = (e) => {
		K(e, p && p.suspense);
	} : c !== "sync" && (m = !0, u.scheduler = (e, t) => {
		t ? e() : nn(e);
	}), u.augmentJob = (e) => {
		n && (e.flags |= 4), m && (e.flags |= 2, p && (e.id = p.uid, e.i = p));
	};
	let h = Wt(e, n, u);
	return Fi && (f ? f.push(h) : d && h()), h;
}
function bn(e, t, n) {
	let r = this.proxy, i = g(e) ? e.includes(".") ? xn(r, e) : () => r[e] : e.bind(r, r), a;
	h(t) ? a = t : (a = t.handler, n = t);
	let o = Mi(this), s = yn(i, a.bind(r), n);
	return o(), s;
}
function xn(e, t) {
	let n = t.split(".");
	return () => {
		let t = e;
		for (let e = 0; e < n.length && t; e++) t = t[n[e]];
		return t;
	};
}
var Sn = /* @__PURE__ */ Symbol("_vte"), Cn = (e) => e.__isTeleport, wn = /* @__PURE__ */ Symbol("_leaveCb");
function Tn(e, t) {
	e.shapeFlag & 6 && e.component ? (e.transition = t, Tn(e.component.subTree, t)) : e.shapeFlag & 128 ? (e.ssContent.transition = t.clone(e.ssContent), e.ssFallback.transition = t.clone(e.ssFallback)) : e.transition = t;
}
// @__NO_SIDE_EFFECTS__
function En(e, t) {
	return h(e) ? /* @__PURE__ */ s({ name: e.name }, t, { setup: e }) : e;
}
function Dn(e) {
	e.ids = [
		e.ids[0] + e.ids[2]++ + "-",
		0,
		0
	];
}
function On(e, t) {
	let n;
	return !!((n = Object.getOwnPropertyDescriptor(e, t)) && !n.configurable);
}
var kn = /* @__PURE__ */ new WeakMap();
function An(e, n, r, a, o = !1) {
	if (d(e)) {
		e.forEach((e, t) => An(e, n && (d(n) ? n[t] : n), r, a, o));
		return;
	}
	if (Mn(a) && !o) {
		a.shapeFlag & 512 && a.type.__asyncResolved && a.component.subTree.component && An(e, n, r, a.component.subTree);
		return;
	}
	let s = a.shapeFlag & 4 ? Wi(a.component) : a.el, l = o ? null : s, { i: f, r: p } = e, m = n && n.r, _ = f.refs === t ? f.refs = {} : f.refs, v = f.setupState, y = /* @__PURE__ */ R(v), b = v === t ? i : (e) => !On(_, e) && u(y, e), x = (e, t) => !(t && On(_, t));
	if (m != null && m !== p) {
		if (jn(n), g(m)) _[m] = null, b(m) && (v[m] = null);
		else if (/* @__PURE__ */ z(m)) {
			let e = n;
			x(m, e.k) && (m.value = null), e.k && (_[e.k] = null);
		}
	}
	if (h(p)) Kt(p, f, 12, [l, _]);
	else {
		let t = g(p), n = /* @__PURE__ */ z(p);
		if (t || n) {
			let i = () => {
				if (e.f) {
					let n = t ? b(p) ? v[p] : _[p] : x(p) || !e.k ? p.value : _[e.k];
					if (o) d(n) && c(n, s);
					else if (d(n)) n.includes(s) || n.push(s);
					else if (t) _[p] = [s], b(p) && (v[p] = _[p]);
					else {
						let t = [s];
						x(p, e.k) && (p.value = t), e.k && (_[e.k] = t);
					}
				} else t ? (_[p] = l, b(p) && (v[p] = l)) : n && (x(p, e.k) && (p.value = l), e.k && (_[e.k] = l));
			};
			if (l) {
				let t = () => {
					i(), kn.delete(e);
				};
				t.id = -1, kn.set(e, t), K(t, r);
			} else jn(e), i();
		}
	}
}
function jn(e) {
	let t = kn.get(e);
	t && (t.flags |= 8, kn.delete(e));
}
le().requestIdleCallback, le().cancelIdleCallback;
var Mn = (e) => !!e.type.__asyncLoader, Nn = (e) => e.type.__isKeepAlive;
function Pn(e, t) {
	In(e, "a", t);
}
function Fn(e, t) {
	In(e, "da", t);
}
function In(e, t, n = Q) {
	let r = e.__wdc ||= () => {
		let t = n;
		for (; t;) {
			if (t.isDeactivated) return;
			t = t.parent;
		}
		return e();
	};
	if (Rn(t, r, n), n) {
		let e = n.parent;
		for (; e && e.parent;) Nn(e.parent.vnode) && Ln(r, t, n, e), e = e.parent;
	}
}
function Ln(e, t, n, r) {
	let i = Rn(t, e, r, !0);
	Wn(() => {
		c(r[t], i);
	}, n);
}
function Rn(e, t, n = Q, r = !1) {
	if (n) {
		let i = n[e] || (n[e] = []), a = t.__weh ||= (...r) => {
			N();
			let i = Mi(n), a = B(t, n, e, r);
			return i(), Le(), a;
		};
		return r ? i.unshift(a) : i.push(a), a;
	}
}
var W = (e) => (t, n = Q) => {
	(!Fi || e === "sp") && Rn(e, (...e) => t(...e), n);
}, zn = W("bm"), Bn = W("m"), Vn = W("bu"), Hn = W("u"), Un = W("bum"), Wn = W("um"), Gn = W("sp"), Kn = W("rtg"), qn = W("rtc");
function Jn(e, t = Q) {
	Rn("ec", e, t);
}
var Yn = /* @__PURE__ */ Symbol.for("v-ndc"), Xn = (e) => e ? Pi(e) ? Wi(e) : Xn(e.parent) : null, Zn = /* @__PURE__ */ s(/* @__PURE__ */ Object.create(null), {
	$: (e) => e,
	$el: (e) => e.vnode.el,
	$data: (e) => e.data,
	$props: (e) => e.props,
	$attrs: (e) => e.attrs,
	$slots: (e) => e.slots,
	$refs: (e) => e.refs,
	$parent: (e) => Xn(e.parent),
	$root: (e) => Xn(e.root),
	$host: (e) => e.ce,
	$emit: (e) => e.emit,
	$options: (e) => or(e),
	$forceUpdate: (e) => e.f ||= () => {
		nn(e.update);
	},
	$nextTick: (e) => e.n ||= en.bind(e.proxy),
	$watch: (e) => bn.bind(e)
}), Qn = (e, n) => e !== t && !e.__isScriptSetup && u(e, n), $n = {
	get({ _: e }, n) {
		if (n === "__v_skip") return !0;
		let { ctx: r, setupState: i, data: a, props: o, accessCache: s, type: c, appContext: l } = e;
		if (n[0] !== "$") {
			let e = s[n];
			if (e !== void 0) switch (e) {
				case 1: return i[n];
				case 2: return a[n];
				case 4: return r[n];
				case 3: return o[n];
			}
			else if (Qn(i, n)) return s[n] = 1, i[n];
			else if (a !== t && u(a, n)) return s[n] = 2, a[n];
			else if (u(o, n)) return s[n] = 3, o[n];
			else if (r !== t && u(r, n)) return s[n] = 4, r[n];
			else tr && (s[n] = 0);
		}
		let d = Zn[n], f, p;
		if (d) return n === "$attrs" && P(e.attrs, "get", ""), d(e);
		if ((f = c.__cssModules) && (f = f[n])) return f;
		if (r !== t && u(r, n)) return s[n] = 4, r[n];
		if (p = l.config.globalProperties, u(p, n)) return p[n];
	},
	set({ _: e }, n, r) {
		let { data: i, setupState: a, ctx: o } = e;
		return Qn(a, n) ? (a[n] = r, !0) : i !== t && u(i, n) ? (i[n] = r, !0) : u(e.props, n) || n[0] === "$" && n.slice(1) in e ? !1 : (o[n] = r, !0);
	},
	has({ _: { data: e, setupState: n, accessCache: r, ctx: i, appContext: a, props: o, type: s } }, c) {
		let l;
		return !!(r[c] || e !== t && c[0] !== "$" && u(e, c) || Qn(n, c) || u(o, c) || u(i, c) || u(Zn, c) || u(a.config.globalProperties, c) || (l = s.__cssModules) && l[c]);
	},
	defineProperty(e, t, n) {
		return n.get == null ? u(n, "value") && this.set(e, t, n.value, null) : e._.accessCache[t] = 0, Reflect.defineProperty(e, t, n);
	}
};
function er(e) {
	return d(e) ? e.reduce((e, t) => (e[t] = null, e), {}) : e;
}
var tr = !0;
function nr(e) {
	let t = or(e), n = e.proxy, i = e.ctx;
	tr = !1, t.beforeCreate && ir(t.beforeCreate, e, "bc");
	let { data: a, computed: o, methods: s, watch: c, provide: l, inject: u, created: f, beforeMount: p, mounted: m, beforeUpdate: g, updated: _, activated: y, deactivated: b, beforeDestroy: x, beforeUnmount: S, destroyed: C, unmounted: w, render: ee, renderTracked: te, renderTriggered: ne, errorCaptured: T, serverPrefetch: re, expose: E, inheritAttrs: ie, components: ae, directives: D, filters: oe } = t;
	if (u && rr(u, i, null), s) for (let e in s) {
		let t = s[e];
		h(t) && (i[e] = t.bind(n));
	}
	if (a) {
		let t = a.call(n, n);
		v(t) && (e.data = /* @__PURE__ */ Tt(t));
	}
	if (tr = !0, o) for (let e in o) {
		let t = o[e], a = Ki({
			get: h(t) ? t.bind(n, n) : h(t.get) ? t.get.bind(n, n) : r,
			set: !h(t) && h(t.set) ? t.set.bind(n) : r
		});
		Object.defineProperty(i, e, {
			enumerable: !0,
			configurable: !0,
			get: () => a.value,
			set: (e) => a.value = e
		});
	}
	if (c) for (let e in c) ar(c[e], i, n, e);
	if (l) {
		let e = h(l) ? l.call(n) : l;
		Reflect.ownKeys(e).forEach((t) => {
			mn(t, e[t]);
		});
	}
	f && ir(f, e, "c");
	function O(e, t) {
		d(t) ? t.forEach((t) => e(t.bind(n))) : t && e(t.bind(n));
	}
	if (O(zn, p), O(Bn, m), O(Vn, g), O(Hn, _), O(Pn, y), O(Fn, b), O(Jn, T), O(qn, te), O(Kn, ne), O(Un, S), O(Wn, w), O(Gn, re), d(E)) {
		if (E.length) {
			let t = e.exposed ||= {};
			E.forEach((e) => {
				Object.defineProperty(t, e, {
					get: () => n[e],
					set: (t) => n[e] = t,
					enumerable: !0
				});
			});
		} else e.exposed ||= {};
	}
	ee && e.render === r && (e.render = ee), ie != null && (e.inheritAttrs = ie), ae && (e.components = ae), D && (e.directives = D), re && Dn(e);
}
function rr(e, t, n = r) {
	d(e) && (e = dr(e));
	for (let n in e) {
		let r = e[n], i;
		i = v(r) ? "default" in r ? hn(r.from || n, r.default, !0) : hn(r.from || n) : hn(r), /* @__PURE__ */ z(i) ? Object.defineProperty(t, n, {
			enumerable: !0,
			configurable: !0,
			get: () => i.value,
			set: (e) => i.value = e
		}) : t[n] = i;
	}
}
function ir(e, t, n) {
	B(d(e) ? e.map((e) => e.bind(t.proxy)) : e.bind(t.proxy), t, n);
}
function ar(e, t, n, r) {
	let i = r.includes(".") ? xn(n, r) : () => n[r];
	if (g(e)) {
		let n = t[e];
		h(n) && vn(i, n);
	} else if (h(e)) vn(i, e.bind(n));
	else if (v(e)) {
		if (d(e)) e.forEach((e) => ar(e, t, n, r));
		else {
			let r = h(e.handler) ? e.handler.bind(n) : t[e.handler];
			h(r) && vn(i, r, e);
		}
	}
}
function or(e) {
	let t = e.type, { mixins: n, extends: r } = t, { mixins: i, optionsCache: a, config: { optionMergeStrategies: o } } = e.appContext, s = a.get(t), c;
	return s ? c = s : !i.length && !n && !r ? c = t : (c = {}, i.length && i.forEach((e) => sr(c, e, o, !0)), sr(c, t, o)), v(t) && a.set(t, c), c;
}
function sr(e, t, n, r = !1) {
	let { mixins: i, extends: a } = t;
	a && sr(e, a, n, !0), i && i.forEach((t) => sr(e, t, n, !0));
	for (let i in t) if (!(r && i === "expose")) {
		let r = cr[i] || n && n[i];
		e[i] = r ? r(e[i], t[i]) : t[i];
	}
	return e;
}
var cr = {
	data: lr,
	props: pr,
	emits: pr,
	methods: fr,
	computed: fr,
	beforeCreate: G,
	created: G,
	beforeMount: G,
	mounted: G,
	beforeUpdate: G,
	updated: G,
	beforeDestroy: G,
	beforeUnmount: G,
	destroyed: G,
	unmounted: G,
	activated: G,
	deactivated: G,
	errorCaptured: G,
	serverPrefetch: G,
	components: fr,
	directives: fr,
	watch: mr,
	provide: lr,
	inject: ur
};
function lr(e, t) {
	return t ? e ? function() {
		return s(h(e) ? e.call(this, this) : e, h(t) ? t.call(this, this) : t);
	} : t : e;
}
function ur(e, t) {
	return fr(dr(e), dr(t));
}
function dr(e) {
	if (d(e)) {
		let t = {};
		for (let n = 0; n < e.length; n++) t[e[n]] = e[n];
		return t;
	}
	return e;
}
function G(e, t) {
	return e ? [...new Set([].concat(e, t))] : t;
}
function fr(e, t) {
	return e ? s(/* @__PURE__ */ Object.create(null), e, t) : t;
}
function pr(e, t) {
	return e ? d(e) && d(t) ? [.../* @__PURE__ */ new Set([...e, ...t])] : s(/* @__PURE__ */ Object.create(null), er(e), er(t ?? {})) : t;
}
function mr(e, t) {
	if (!e) return t;
	if (!t) return e;
	let n = s(/* @__PURE__ */ Object.create(null), e);
	for (let r in t) n[r] = G(e[r], t[r]);
	return n;
}
function hr() {
	return {
		app: null,
		config: {
			isNativeTag: i,
			performance: !1,
			globalProperties: {},
			optionMergeStrategies: {},
			errorHandler: void 0,
			warnHandler: void 0,
			compilerOptions: {}
		},
		mixins: [],
		components: {},
		directives: {},
		provides: /* @__PURE__ */ Object.create(null),
		optionsCache: /* @__PURE__ */ new WeakMap(),
		propsCache: /* @__PURE__ */ new WeakMap(),
		emitsCache: /* @__PURE__ */ new WeakMap()
	};
}
var gr = 0;
function _r(e, t) {
	return function(n, r = null) {
		h(n) || (n = s({}, n)), r != null && !v(r) && (r = null);
		let i = hr(), a = /* @__PURE__ */ new WeakSet(), o = [], c = !1, l = i.app = {
			_uid: gr++,
			_component: n,
			_props: r,
			_container: null,
			_context: i,
			_instance: null,
			version: Ji,
			get config() {
				return i.config;
			},
			set config(e) {},
			use(e, ...t) {
				return a.has(e) || (e && h(e.install) ? (a.add(e), e.install(l, ...t)) : h(e) && (a.add(e), e(l, ...t))), l;
			},
			mixin(e) {
				return i.mixins.includes(e) || i.mixins.push(e), l;
			},
			component(e, t) {
				return t ? (i.components[e] = t, l) : i.components[e];
			},
			directive(e, t) {
				return t ? (i.directives[e] = t, l) : i.directives[e];
			},
			mount(a, o, s) {
				if (!c) {
					let u = l._ceVNode || Y(n, r);
					return u.appContext = i, s === !0 ? s = "svg" : s === !1 && (s = void 0), o && t ? t(u, a) : e(u, a, s), c = !0, l._container = a, a.__vue_app__ = l, Wi(u.component);
				}
			},
			onUnmount(e) {
				o.push(e);
			},
			unmount() {
				c && (B(o, l._instance, 16), e(null, l._container), delete l._container.__vue_app__);
			},
			provide(e, t) {
				return i.provides[e] = t, l;
			},
			runWithContext(e) {
				let t = vr;
				vr = l;
				try {
					return e();
				} finally {
					vr = t;
				}
			}
		};
		return l;
	};
}
var vr = null, yr = (e, t) => t === "modelValue" || t === "model-value" ? e.modelModifiers : e[`${t}Modifiers`] || e[`${T(t)}Modifiers`] || e[`${E(t)}Modifiers`];
function br(e, n, ...r) {
	if (e.isUnmounted) return;
	let i = e.vnode.props || t, a = r, o = n.startsWith("update:"), s = o && yr(i, n.slice(7));
	s && (s.trim && (a = r.map((e) => g(e) ? e.trim() : e)), s.number && (a = r.map(se)));
	let c, l = i[c = ae(n)] || i[c = ae(T(n))];
	!l && o && (l = i[c = ae(E(n))]), l && B(l, e, 6, a);
	let u = i[c + "Once"];
	if (u) {
		if (!e.emitted) e.emitted = {};
		else if (e.emitted[c]) return;
		e.emitted[c] = !0, B(u, e, 6, a);
	}
}
var xr = /* @__PURE__ */ new WeakMap();
function Sr(e, t, n = !1) {
	let r = n ? xr : t.emitsCache, i = r.get(e);
	if (i !== void 0) return i;
	let a = e.emits, o = {}, c = !1;
	if (!h(e)) {
		let r = (e) => {
			let n = Sr(e, t, !0);
			n && (c = !0, s(o, n));
		};
		!n && t.mixins.length && t.mixins.forEach(r), e.extends && r(e.extends), e.mixins && e.mixins.forEach(r);
	}
	return !a && !c ? (v(e) && r.set(e, null), null) : (d(a) ? a.forEach((e) => o[e] = null) : s(o, a), v(e) && r.set(e, o), o);
}
function Cr(e, t) {
	return !e || !a(t) ? !1 : (t = t.slice(2), t = t === "Once" ? t : t.replace(/Once$/, ""), u(e, t[0].toLowerCase() + t.slice(1)) || u(e, E(t)) || u(e, t));
}
function wr(e) {
	let { type: t, vnode: n, proxy: r, withProxy: i, propsOptions: [a], slots: s, attrs: c, emit: l, render: u, renderCache: d, props: f, data: p, setupState: m, ctx: h, inheritAttrs: g } = e, _ = dn(e), v, y;
	try {
		if (n.shapeFlag & 4) {
			let e = i || r, t = e;
			v = X(u.call(t, e, d, f, m, p, h)), y = c;
		} else {
			let e = t;
			v = X(e.length > 1 ? e(f, {
				attrs: c,
				slots: s,
				emit: l
			}) : e(f, null)), y = t.props ? c : Tr(c);
		}
	} catch (t) {
		ui.length = 0, qt(t, e, 1), v = Y(ci);
	}
	let b = v;
	if (y && g !== !1) {
		let e = Object.keys(y), { shapeFlag: t } = b;
		e.length && t & 7 && (a && e.some(o) && (y = Er(y, a)), b = xi(b, y, !1, !0));
	}
	return n.dirs && (b = xi(b, null, !1, !0), b.dirs = b.dirs ? b.dirs.concat(n.dirs) : n.dirs), n.transition && Tn(b, n.transition), v = b, dn(_), v;
}
var Tr = (e) => {
	let t;
	for (let n in e) (n === "class" || n === "style" || a(n)) && ((t ||= {})[n] = e[n]);
	return t;
}, Er = (e, t) => {
	let n = {};
	for (let r in e) (!o(r) || !(r.slice(9) in t)) && (n[r] = e[r]);
	return n;
};
function Dr(e, t, n) {
	let { props: r, children: i, component: a } = e, { props: o, children: s, patchFlag: c } = t, l = a.emitsOptions;
	if (t.dirs || t.transition) return !0;
	if (n && c >= 0) {
		if (c & 1024) return !0;
		if (c & 16) return r ? Or(r, o, l) : !!o;
		if (c & 8) {
			let e = t.dynamicProps;
			for (let t = 0; t < e.length; t++) {
				let n = e[t];
				if (kr(o, r, n) && !Cr(l, n)) return !0;
			}
		}
	} else return (i || s) && (!s || !s.$stable) ? !0 : r === o ? !1 : r ? !o || Or(r, o, l) : !!o;
	return !1;
}
function Or(e, t, n) {
	let r = Object.keys(t);
	if (r.length !== Object.keys(e).length) return !0;
	for (let i = 0; i < r.length; i++) {
		let a = r[i];
		if (kr(t, e, a) && !Cr(n, a)) return !0;
	}
	return !1;
}
function kr(e, t, n) {
	let r = e[n], i = t[n];
	return n === "style" && v(r) && v(i) ? !ye(r, i) : r !== i;
}
function Ar({ vnode: e, parent: t, suspense: n }, r) {
	for (; t;) {
		let n = t.subTree;
		if (n.suspense && n.suspense.activeBranch === e && (n.suspense.vnode.el = n.el = r, e = n), n === e) (e = t.vnode).el = r, t = t.parent;
		else break;
	}
	n && n.activeBranch === e && (n.vnode.el = r);
}
var jr = {}, Mr = () => Object.create(jr), Nr = (e) => Object.getPrototypeOf(e) === jr;
function Pr(e, t, n, r = !1) {
	let i = {}, a = Mr();
	e.propsDefaults = /* @__PURE__ */ Object.create(null), Ir(e, t, i, a);
	for (let t in e.propsOptions[0]) t in i || (i[t] = void 0);
	e.props = n ? r ? i : /* @__PURE__ */ Et(i) : e.type.props ? i : a, e.attrs = a;
}
function Fr(e, t, n, r) {
	let { props: i, attrs: a, vnode: { patchFlag: o } } = e, s = /* @__PURE__ */ R(i), [c] = e.propsOptions, l = !1;
	if ((r || o > 0) && !(o & 16)) {
		if (o & 8) {
			let n = e.vnode.dynamicProps;
			for (let r = 0; r < n.length; r++) {
				let o = n[r];
				if (Cr(e.emitsOptions, o)) continue;
				let d = t[o];
				if (c) {
					if (u(a, o)) d !== a[o] && (a[o] = d, l = !0);
					else {
						let t = T(o);
						i[t] = Lr(c, s, t, d, e, !1);
					}
				} else d !== a[o] && (a[o] = d, l = !0);
			}
		}
	} else {
		Ir(e, t, i, a) && (l = !0);
		let r;
		for (let a in s) (!t || !u(t, a) && ((r = E(a)) === a || !u(t, r))) && (c ? n && (n[a] !== void 0 || n[r] !== void 0) && (i[a] = Lr(c, s, a, void 0, e, !0)) : delete i[a]);
		if (a !== s) for (let e in a) (!t || !u(t, e)) && (delete a[e], l = !0);
	}
	l && qe(e.attrs, "set", "");
}
function Ir(e, n, r, i) {
	let [a, o] = e.propsOptions, s = !1, c;
	if (n) for (let t in n) {
		if (ee(t)) continue;
		let l = n[t], d;
		a && u(a, d = T(t)) ? !o || !o.includes(d) ? r[d] = l : (c ||= {})[d] = l : Cr(e.emitsOptions, t) || (!(t in i) || l !== i[t]) && (i[t] = l, s = !0);
	}
	if (o) {
		let n = /* @__PURE__ */ R(r), i = c || t;
		for (let t = 0; t < o.length; t++) {
			let s = o[t];
			r[s] = Lr(a, n, s, i[s], e, !u(i, s));
		}
	}
	return s;
}
function Lr(e, t, n, r, i, a) {
	let o = e[n];
	if (o != null) {
		let e = u(o, "default");
		if (e && r === void 0) {
			let e = o.default;
			if (o.type !== Function && !o.skipFactory && h(e)) {
				let { propsDefaults: a } = i;
				if (n in a) r = a[n];
				else {
					let o = Mi(i);
					r = a[n] = e.call(null, t), o();
				}
			} else r = e;
			i.ce && i.ce._setProp(n, r);
		}
		o[0] && (a && !e ? r = !1 : o[1] && (r === "" || r === E(n)) && (r = !0));
	}
	return r;
}
var Rr = /* @__PURE__ */ new WeakMap();
function zr(e, r, i = !1) {
	let a = i ? Rr : r.propsCache, o = a.get(e);
	if (o) return o;
	let c = e.props, l = {}, f = [], p = !1;
	if (!h(e)) {
		let t = (e) => {
			p = !0;
			let [t, n] = zr(e, r, !0);
			s(l, t), n && f.push(...n);
		};
		!i && r.mixins.length && r.mixins.forEach(t), e.extends && t(e.extends), e.mixins && e.mixins.forEach(t);
	}
	if (!c && !p) return v(e) && a.set(e, n), n;
	if (d(c)) for (let e = 0; e < c.length; e++) {
		let n = T(c[e]);
		Br(n) && (l[n] = t);
	}
	else if (c) for (let e in c) {
		let t = T(e);
		if (Br(t)) {
			let n = c[e], r = l[t] = d(n) || h(n) ? { type: n } : s({}, n), i = r.type, a = !1, o = !0;
			if (d(i)) for (let e = 0; e < i.length; ++e) {
				let t = i[e], n = h(t) && t.name;
				if (n === "Boolean") {
					a = !0;
					break;
				}
				n === "String" && (o = !1);
			}
			else a = h(i) && i.name === "Boolean";
			r[0] = a, r[1] = o, (a || u(r, "default")) && f.push(t);
		}
	}
	let m = [l, f];
	return v(e) && a.set(e, m), m;
}
function Br(e) {
	return e[0] !== "$" && !ee(e);
}
var Vr = (e) => e === "_" || e === "_ctx" || e === "$stable", Hr = (e) => d(e) ? e.map(X) : [X(e)], Ur = (e, t, n) => {
	if (t._n) return t;
	let r = fn((...e) => Hr(t(...e)), n);
	return r._c = !1, r;
}, Wr = (e, t, n) => {
	let r = e._ctx;
	for (let n in e) {
		if (Vr(n)) continue;
		let i = e[n];
		if (h(i)) t[n] = Ur(n, i, r);
		else if (i != null) {
			let e = Hr(i);
			t[n] = () => e;
		}
	}
}, Gr = (e, t) => {
	let n = Hr(t);
	e.slots.default = () => n;
}, Kr = (e, t, n) => {
	for (let r in t) (n || !Vr(r)) && (e[r] = t[r]);
}, qr = (e, t, n) => {
	let r = e.slots = Mr();
	if (e.vnode.shapeFlag & 32) {
		let e = t._;
		e ? (Kr(r, t, n), n && O(r, "_", e, !0)) : Wr(t, r);
	} else t && Gr(e, t);
}, Jr = (e, n, r) => {
	let { vnode: i, slots: a } = e, o = !0, s = t;
	if (i.shapeFlag & 32) {
		let e = n._;
		e ? r && e === 1 ? o = !1 : Kr(a, n, r) : (o = !n.$stable, Wr(n, a)), s = n;
	} else n && (Gr(e, n), s = { default: 1 });
	if (o) for (let e in a) !Vr(e) && s[e] == null && delete a[e];
}, K = oi;
function Yr(e) {
	return Xr(e);
}
function Xr(e, i) {
	let a = le();
	a.__VUE__ = !0;
	let { insert: o, remove: s, patchProp: c, createElement: l, createText: u, createComment: d, setText: f, setElementText: p, parentNode: m, nextSibling: h, setScopeId: g = r, insertStaticContent: _ } = e, v = (e, t, n, r = null, i = null, a = null, o = void 0, s = null, c = !!t.dynamicChildren) => {
		if (e === t) return;
		e && !hi(e, t) && (r = ye(e), k(e, i, a, !0), e = null), t.patchFlag === -2 && (c = !1, t.dynamicChildren = null);
		let { type: l, ref: u, shapeFlag: d } = t;
		switch (l) {
			case si:
				y(e, t, n, r);
				break;
			case ci:
				b(e, t, n, r);
				break;
			case li:
				e ?? x(t, n, r, o);
				break;
			case q:
				ae(e, t, n, r, i, a, o, s, c);
				break;
			default: d & 1 ? w(e, t, n, r, i, a, o, s, c) : d & 6 ? D(e, t, n, r, i, a, o, s, c) : (d & 64 || d & 128) && l.process(e, t, n, r, i, a, o, s, c, xe);
		}
		u != null && i ? An(u, e && e.ref, a, t || e, !t) : u == null && e && e.ref != null && An(e.ref, null, a, e, !0);
	}, y = (e, t, n, r) => {
		if (e == null) o(t.el = u(t.children), n, r);
		else {
			let n = t.el = e.el;
			t.children !== e.children && f(n, t.children);
		}
	}, b = (e, t, n, r) => {
		e == null ? o(t.el = d(t.children || ""), n, r) : t.el = e.el;
	}, x = (e, t, n, r) => {
		[e.el, e.anchor] = _(e.children, t, n, r, e.el, e.anchor);
	}, S = ({ el: e, anchor: t }, n, r) => {
		let i;
		for (; e && e !== t;) i = h(e), o(e, n, r), e = i;
		o(t, n, r);
	}, C = ({ el: e, anchor: t }) => {
		let n;
		for (; e && e !== t;) n = h(e), s(e), e = n;
		s(t);
	}, w = (e, t, n, r, i, a, o, s, c) => {
		if (t.type === "svg" ? o = "svg" : t.type === "math" && (o = "mathml"), e == null) te(t, n, r, i, a, o, s, c);
		else {
			let n = e.el && e.el._isVueCE ? e.el : null;
			try {
				n && n._beginPatch(), re(e, t, i, a, o, s, c);
			} finally {
				n && n._endPatch();
			}
		}
	}, te = (e, t, n, r, i, a, s, u) => {
		let d, f, { props: m, shapeFlag: h, transition: g, dirs: _ } = e;
		if (d = e.el = l(e.type, a, m && m.is, m), h & 8 ? p(d, e.children) : h & 16 && T(e.children, d, null, r, i, Zr(e, a), s, u), _ && pn(e, null, r, "created"), ne(d, e, e.scopeId, s, r), m) {
			for (let e in m) e !== "value" && !ee(e) && c(d, e, null, m[e], a, r);
			"value" in m && c(d, "value", null, m.value, a), (f = m.onVnodeBeforeMount) && Z(f, r, e);
		}
		_ && pn(e, null, r, "beforeMount");
		let v = $r(i, g);
		v && g.beforeEnter(d), o(d, t, n), ((f = m && m.onVnodeMounted) || v || _) && K(() => {
			try {
				f && Z(f, r, e), v && g.enter(d), _ && pn(e, null, r, "mounted");
			} finally {}
		}, i);
	}, ne = (e, t, n, r, i) => {
		if (n && g(e, n), r) for (let t = 0; t < r.length; t++) g(e, r[t]);
		if (i) {
			let n = i.subTree;
			if (t === n || ai(n.type) && (n.ssContent === t || n.ssFallback === t)) {
				let t = i.vnode;
				ne(e, t, t.scopeId, t.slotScopeIds, i.parent);
			}
		}
	}, T = (e, t, n, r, i, a, o, s, c = 0) => {
		for (let l = c; l < e.length; l++) {
			let c = e[l] = s ? Ci(e[l]) : X(e[l]);
			v(null, c, t, n, r, i, a, o, s);
		}
	}, re = (e, n, r, i, a, o, s) => {
		let l = n.el = e.el, { patchFlag: u, dynamicChildren: d, dirs: f } = n;
		u |= e.patchFlag & 16;
		let m = e.props || t, h = n.props || t, g;
		if (r && Qr(r, !1), (g = h.onVnodeBeforeUpdate) && Z(g, r, n, e), f && pn(n, e, r, "beforeUpdate"), r && Qr(r, !0), d && (!e.dynamicChildren || e.dynamicChildren.length !== d.length) && (u = 0, s = !1, d = null), (m.innerHTML && h.innerHTML == null || m.textContent && h.textContent == null) && p(l, ""), d ? E(e.dynamicChildren, d, l, r, i, Zr(n, a), o) : s || de(e, n, l, null, r, i, Zr(n, a), o, !1), u > 0) {
			if (u & 16) ie(l, m, h, r, a);
			else if (u & 2 && m.class !== h.class && c(l, "class", null, h.class, a), u & 4 && c(l, "style", m.style, h.style, a), u & 8) {
				let e = n.dynamicProps;
				for (let t = 0; t < e.length; t++) {
					let n = e[t], i = m[n], o = h[n];
					(o !== i || n === "value") && c(l, n, i, o, a, r);
				}
			}
			u & 1 && e.children !== n.children && p(l, n.children);
		} else !s && d == null && ie(l, m, h, r, a);
		((g = h.onVnodeUpdated) || f) && K(() => {
			g && Z(g, r, n, e), f && pn(n, e, r, "updated");
		}, i);
	}, E = (e, t, n, r, i, a, o) => {
		for (let s = 0; s < t.length; s++) {
			let c = e[s], l = t[s], u = c.el && (c.type === q || !hi(c, l) || c.shapeFlag & 198) ? m(c.el) : n;
			v(c, l, u, null, r, i, a, o, !0);
		}
	}, ie = (e, n, r, i, a) => {
		if (n !== r) {
			if (n !== t) for (let t in n) !ee(t) && !(t in r) && c(e, t, n[t], null, a, i);
			for (let t in r) {
				if (ee(t)) continue;
				let o = r[t], s = n[t];
				o !== s && t !== "value" && c(e, t, s, o, a, i);
			}
			"value" in r && c(e, "value", n.value, r.value, a);
		}
	}, ae = (e, t, n, r, i, a, s, c, l) => {
		let d = t.el = e ? e.el : u(""), f = t.anchor = e ? e.anchor : u(""), { patchFlag: p, dynamicChildren: m, slotScopeIds: h } = t;
		h && (c = c ? c.concat(h) : h), e == null ? (o(d, n, r), o(f, n, r), T(t.children || [], n, f, i, a, s, c, l)) : p > 0 && p & 64 && m && e.dynamicChildren && e.dynamicChildren.length === m.length ? (E(e.dynamicChildren, m, n, i, a, s, c), (t.key != null || i && t === i.subTree) && ei(e, t, !0)) : de(e, t, n, f, i, a, s, c, l);
	}, D = (e, t, n, r, i, a, o, s, c) => {
		t.slotScopeIds = s, e == null ? t.shapeFlag & 512 ? i.ctx.activate(t, n, r, o, c) : O(t, n, r, i, a, o, c) : se(e, t, c);
	}, O = (e, t, n, r, i, a, o) => {
		let s = e.component = Oi(e, r, i);
		if (Nn(e) && (s.ctx.renderer = xe), Ii(s, !1, o), s.asyncDep) {
			if (i && i.registerDep(s, ce, o), !e.el) {
				let r = s.subTree = Y(ci);
				b(null, r, t, n), e.placeholder = r.el;
			}
		} else ce(s, e, t, n, i, a, o);
	}, se = (e, t, n) => {
		let r = t.component = e.component;
		if (Dr(e, t, n)) {
			if (r.asyncDep && !r.asyncResolved) {
				ue(r, t, n);
				return;
			}
			r.next = t, r.update();
		} else t.el = e.el, r.vnode = t;
	}, ce = (e, t, n, r, i, a, o) => {
		let s = () => {
			if (e.isMounted) {
				let { next: t, bu: n, u: r, parent: s, vnode: c } = e;
				{
					let n = ni(e);
					if (n) {
						t && (t.el = c.el, ue(e, t, o)), n.asyncDep.then(() => {
							K(() => {
								e.isUnmounted || l();
							}, i);
						});
						return;
					}
				}
				let u = t, d;
				Qr(e, !1), t ? (t.el = c.el, ue(e, t, o)) : t = c, n && oe(n), (d = t.props && t.props.onVnodeBeforeUpdate) && Z(d, s, t, c), Qr(e, !0);
				let f = wr(e), p = e.subTree;
				e.subTree = f, v(p, f, m(p.el), ye(p), e, i, a), t.el = f.el, u === null && Ar(e, f.el), r && K(r, i), (d = t.props && t.props.onVnodeUpdated) && K(() => Z(d, s, t, c), i);
			} else {
				let o, { el: s, props: c } = t, { bm: l, m: u, parent: d, root: f, type: p } = e, m = Mn(t);
				if (Qr(e, !1), l && oe(l), !m && (o = c && c.onVnodeBeforeMount) && Z(o, d, t), Qr(e, !0), s && Se) {
					let t = () => {
						e.subTree = wr(e), Se(s, e.subTree, e, i, null);
					};
					m && p.__asyncHydrate ? p.__asyncHydrate(s, e, t) : t();
				} else {
					f.ce && f.ce._hasShadowRoot() && f.ce._injectChildStyle(p, e.parent ? e.parent.type : void 0);
					let o = e.subTree = wr(e);
					v(null, o, n, r, e, i, a), t.el = o.el;
				}
				if (u && K(u, i), !m && (o = c && c.onVnodeMounted)) {
					let e = t;
					K(() => Z(o, d, e), i);
				}
				(t.shapeFlag & 256 || d && Mn(d.vnode) && d.vnode.shapeFlag & 256) && e.a && K(e.a, i), e.isMounted = !0, t = n = r = null;
			}
		};
		e.scope.on();
		let c = e.effect = new Ce(s);
		e.scope.off();
		let l = e.update = c.run.bind(c), u = e.job = c.runIfDirty.bind(c);
		u.i = e, u.id = e.uid, c.scheduler = () => nn(u), Qr(e, !0), l();
	}, ue = (e, t, n) => {
		t.component = e;
		let r = e.vnode.props;
		e.vnode = t, e.next = null, Fr(e, t.props, r, n), Jr(e, t.children, n), N(), on(e), Le();
	}, de = (e, t, n, r, i, a, o, s, c = !1) => {
		let l = e && e.children, u = e ? e.shapeFlag : 0, d = t.children, { patchFlag: f, shapeFlag: m } = t;
		if (f > 0) {
			if (f & 128) {
				pe(l, d, n, r, i, a, o, s, c);
				return;
			}
			if (f & 256) {
				fe(l, d, n, r, i, a, o, s, c);
				return;
			}
		}
		m & 8 ? (u & 16 && ve(l, i, a), d !== l && p(n, d)) : u & 16 ? m & 16 ? pe(l, d, n, r, i, a, o, s, c) : ve(l, i, a, !0) : (u & 8 && p(n, ""), m & 16 && T(d, n, r, i, a, o, s, c));
	}, fe = (e, t, r, i, a, o, s, c, l) => {
		e ||= n, t ||= n;
		let u = e.length, d = t.length, f = Math.min(u, d), p;
		for (p = 0; p < f; p++) {
			let n = t[p] = l ? Ci(t[p]) : X(t[p]);
			v(e[p], n, r, null, a, o, s, c, l);
		}
		u > d ? ve(e, a, o, !0, !1, f) : T(t, r, i, a, o, s, c, l, f);
	}, pe = (e, t, r, i, a, o, s, c, l) => {
		let u = 0, d = t.length, f = e.length - 1, p = d - 1;
		for (; u <= f && u <= p;) {
			let n = e[u], i = t[u] = l ? Ci(t[u]) : X(t[u]);
			if (hi(n, i)) v(n, i, r, null, a, o, s, c, l);
			else break;
			u++;
		}
		for (; u <= f && u <= p;) {
			let n = e[f], i = t[p] = l ? Ci(t[p]) : X(t[p]);
			if (hi(n, i)) v(n, i, r, null, a, o, s, c, l);
			else break;
			f--, p--;
		}
		if (u > f) {
			if (u <= p) {
				let e = p + 1, n = e < d ? t[e].el : i;
				for (; u <= p;) v(null, t[u] = l ? Ci(t[u]) : X(t[u]), r, n, a, o, s, c, l), u++;
			}
		} else if (u > p) for (; u <= f;) k(e[u], a, o, !0), u++;
		else {
			let m = u, h = u, g = /* @__PURE__ */ new Map();
			for (u = h; u <= p; u++) {
				let e = t[u] = l ? Ci(t[u]) : X(t[u]);
				e.key != null && g.set(e.key, u);
			}
			let _, y = 0, b = p - h + 1, x = !1, S = 0, C = Array(b);
			for (u = 0; u < b; u++) C[u] = 0;
			for (u = m; u <= f; u++) {
				let n = e[u];
				if (y >= b) {
					k(n, a, o, !0);
					continue;
				}
				let i;
				if (n.key != null) i = g.get(n.key);
				else for (_ = h; _ <= p; _++) if (C[_ - h] === 0 && hi(n, t[_])) {
					i = _;
					break;
				}
				i === void 0 ? k(n, a, o, !0) : (C[i - h] = u + 1, i >= S ? S = i : x = !0, v(n, t[i], r, null, a, o, s, c, l), y++);
			}
			let w = x ? ti(C) : n;
			for (_ = w.length - 1, u = b - 1; u >= 0; u--) {
				let e = h + u, n = t[e], f = t[e + 1], p = e + 1 < d ? f.el || ii(f) : i;
				C[u] === 0 ? v(null, n, r, p, a, o, s, c, l) : x && (_ < 0 || u !== w[_] ? me(n, r, p, 2) : _--);
			}
		}
	}, me = (e, t, n, r, i = null) => {
		let { el: a, type: c, transition: l, children: u, shapeFlag: d } = e;
		if (d & 6) {
			me(e.component.subTree, t, n, r);
			return;
		}
		if (d & 128) {
			e.suspense.move(t, n, r);
			return;
		}
		if (d & 64) {
			c.move(e, t, n, xe);
			return;
		}
		if (c === q) {
			o(a, t, n);
			for (let e = 0; e < u.length; e++) me(u[e], t, n, r);
			o(e.anchor, t, n);
			return;
		}
		if (c === li) {
			S(e, t, n);
			return;
		}
		if (r !== 2 && d & 1 && l) {
			if (r === 0) l.persisted && !a[wn] ? o(a, t, n) : (l.beforeEnter(a), o(a, t, n), K(() => l.enter(a), i));
			else {
				let { leave: r, delayLeave: i, afterLeave: c } = l, u = () => {
					e.ctx.isUnmounted ? s(a) : o(a, t, n);
				}, d = () => {
					let e = a._isLeaving || !!a[wn];
					a._isLeaving && a[wn](!0), l.persisted && !e ? u() : r(a, () => {
						u(), c && c();
					});
				};
				i ? i(a, u, d) : d();
			}
		} else o(a, t, n);
	}, k = (e, t, n, r = !1, i = !1) => {
		let { type: a, props: o, ref: s, children: c, dynamicChildren: l, shapeFlag: u, patchFlag: d, dirs: f, cacheIndex: p, memo: m } = e;
		if (d === -2 && (i = !1), s != null && (N(), An(s, null, n, e, !0), Le()), p != null && (t.renderCache[p] = void 0), u & 256) {
			t.ctx.deactivate(e);
			return;
		}
		let h = u & 1 && f, g = !Mn(e), _;
		if (g && (_ = o && o.onVnodeBeforeUnmount) && Z(_, t, e), u & 6) _e(e.component, n, r);
		else {
			if (u & 128) {
				e.suspense.unmount(n, r);
				return;
			}
			h && pn(e, null, t, "beforeUnmount"), u & 64 ? e.type.remove(e, t, n, xe, r) : l && !l.hasOnce && (a !== q || d > 0 && d & 64) ? ve(l, t, n, !1, !0) : (a === q && d & 384 || !i && u & 16) && ve(c, t, n), r && he(e);
		}
		let v = m != null && p == null;
		(g && (_ = o && o.onVnodeUnmounted) || h || v) && K(() => {
			_ && Z(_, t, e), h && pn(e, null, t, "unmounted"), v && (e.el = null);
		}, n);
	}, he = (e) => {
		let { type: t, el: n, anchor: r, transition: i } = e;
		if (t === q) {
			ge(n, r);
			return;
		}
		if (t === li) {
			C(e);
			return;
		}
		let a = () => {
			s(n), i && !i.persisted && i.afterLeave && i.afterLeave();
		};
		if (e.shapeFlag & 1 && i && !i.persisted) {
			let { leave: t, delayLeave: r } = i, o = () => t(n, a);
			r ? r(e.el, a, o) : o();
		} else a();
	}, ge = (e, t) => {
		let n;
		for (; e !== t;) n = h(e), s(e), e = n;
		s(t);
	}, _e = (e, t, n) => {
		let { bum: r, scope: i, job: a, subTree: o, um: s, m: c, a: l } = e;
		ri(c), ri(l), r && oe(r), i.stop(), a && (a.flags |= 8, k(o, e, t, n)), s && K(s, t), K(() => {
			e.isUnmounted = !0;
		}, t);
	}, ve = (e, t, n, r = !1, i = !1, a = 0) => {
		for (let o = a; o < e.length; o++) k(e[o], t, n, r, i);
	}, ye = (e) => {
		if (e.shapeFlag & 6) return ye(e.component.subTree);
		if (e.shapeFlag & 128) return e.suspense.next();
		let t = h(e.anchor || e.el), n = t && t[Sn];
		return n ? h(n) : t;
	}, A = !1, be = (e, t, n) => {
		let r;
		e == null ? t._vnode && (k(t._vnode, null, null, !0), r = t._vnode.component) : v(t._vnode || null, e, t, null, null, null, n), t._vnode = e, A ||= (A = !0, on(r), sn(), !1);
	}, xe = {
		p: v,
		um: k,
		m: me,
		r: he,
		mt: O,
		mc: T,
		pc: de,
		pbc: E,
		n: ye,
		o: e
	}, j, Se;
	return i && ([j, Se] = i(xe)), {
		render: be,
		hydrate: j,
		createApp: _r(be, j)
	};
}
function Zr({ type: e, props: t }, n) {
	return n === "svg" && e === "foreignObject" || n === "mathml" && e === "annotation-xml" && t && t.encoding && t.encoding.includes("html") ? void 0 : n;
}
function Qr({ effect: e, job: t }, n) {
	n ? (e.flags |= 32, t.flags |= 4) : (e.flags &= -33, t.flags &= -5);
}
function $r(e, t) {
	return (!e || e && !e.pendingBranch) && t && !t.persisted;
}
function ei(e, t, n = !1) {
	let r = e.children, i = t.children;
	if (d(r) && d(i)) for (let e = 0; e < r.length; e++) {
		let t = r[e], a = i[e];
		a.shapeFlag & 1 && !a.dynamicChildren && ((a.patchFlag <= 0 || a.patchFlag === 32) && (a = i[e] = Ci(i[e]), a.el = t.el), !n && a.patchFlag !== -2 && ei(t, a)), a.type === si && (a.patchFlag === -1 && (a = i[e] = Ci(a)), a.el = t.el), a.type === ci && !a.el && (a.el = t.el);
	}
}
function ti(e) {
	let t = e.slice(), n = [0], r, i, a, o, s, c = e.length;
	for (r = 0; r < c; r++) {
		let c = e[r];
		if (c !== 0) {
			if (i = n[n.length - 1], e[i] < c) {
				t[r] = i, n.push(r);
				continue;
			}
			for (a = 0, o = n.length - 1; a < o;) s = a + o >> 1, e[n[s]] < c ? a = s + 1 : o = s;
			c < e[n[a]] && (a > 0 && (t[r] = n[a - 1]), n[a] = r);
		}
	}
	for (a = n.length, o = n[a - 1]; a-- > 0;) n[a] = o, o = t[o];
	return n;
}
function ni(e) {
	let t = e.subTree.component;
	if (t) return t.asyncDep && !t.asyncResolved ? t : ni(t);
}
function ri(e) {
	if (e) for (let t = 0; t < e.length; t++) e[t].flags |= 8;
}
function ii(e) {
	if (e.placeholder) return e.placeholder;
	let t = e.component;
	return t ? ii(t.subTree) : null;
}
var ai = (e) => e.__isSuspense;
function oi(e, t) {
	t && t.pendingBranch ? d(e) ? t.effects.push(...e) : t.effects.push(e) : an(e);
}
var q = /* @__PURE__ */ Symbol.for("v-fgt"), si = /* @__PURE__ */ Symbol.for("v-txt"), ci = /* @__PURE__ */ Symbol.for("v-cmt"), li = /* @__PURE__ */ Symbol.for("v-stc"), ui = [], J = null;
function di() {
	ui.pop(), J = ui[ui.length - 1] || null;
}
var fi = 1;
function pi(e, t = !1) {
	fi += e, e < 0 && J && t && (J.hasOnce = !0);
}
function mi(e) {
	return e ? e.__v_isVNode === !0 : !1;
}
function hi(e, t) {
	return e.type === t.type && e.key === t.key;
}
var gi = ({ key: e }) => e ?? null, _i = ({ ref: e, ref_key: t, ref_for: n }) => (typeof e == "number" && (e = "" + e), e == null ? null : g(e) || /* @__PURE__ */ z(e) || h(e) ? {
	i: U,
	r: e,
	k: t,
	f: !!n
} : e);
function vi(e, t = null, n = null, r = 0, i = null, a = e === q ? 0 : 1, o = !1, s = !1) {
	let c = {
		__v_isVNode: !0,
		__v_skip: !0,
		type: e,
		props: t,
		key: t && gi(t),
		ref: t && _i(t),
		scopeId: un,
		slotScopeIds: null,
		children: n,
		component: null,
		suspense: null,
		ssContent: null,
		ssFallback: null,
		dirs: null,
		transition: null,
		el: null,
		anchor: null,
		target: null,
		targetStart: null,
		targetAnchor: null,
		staticCount: 0,
		shapeFlag: a,
		patchFlag: r,
		dynamicProps: i,
		dynamicChildren: null,
		appContext: null,
		ctx: U
	};
	return s ? (wi(c, n), a & 128 && e.normalize(c)) : n && (c.shapeFlag |= g(n) ? 8 : 16), fi > 0 && !o && J && (c.patchFlag > 0 || a & 6) && c.patchFlag !== 32 && J.push(c), c;
}
var Y = yi;
function yi(e, t = null, n = null, r = 0, i = null, a = !1) {
	if ((!e || e === Yn) && (e = ci), mi(e)) {
		let r = xi(e, t, !0);
		return n && wi(r, n), fi > 0 && !a && J && (r.shapeFlag & 6 ? J[J.indexOf(e)] = r : J.push(r)), r.patchFlag = -2, r;
	}
	if (Gi(e) && (e = e.__vccOpts), t) {
		t = bi(t);
		let { class: e, style: n } = t;
		e && !g(e) && (t.class = k(e)), v(n) && (/* @__PURE__ */ jt(n) && !d(n) && (n = s({}, n)), t.style = ue(n));
	}
	let o = g(e) ? 1 : ai(e) ? 128 : Cn(e) ? 64 : v(e) ? 4 : h(e) ? 2 : 0;
	return vi(e, t, n, r, i, o, a, !0);
}
function bi(e) {
	return e ? /* @__PURE__ */ jt(e) || Nr(e) ? s({}, e) : e : null;
}
function xi(e, t, n = !1, r = !1) {
	let { props: i, ref: a, patchFlag: o, children: s, transition: c } = e, l = t ? Ti(i || {}, t) : i, u = {
		__v_isVNode: !0,
		__v_skip: !0,
		type: e.type,
		props: l,
		key: l && gi(l),
		ref: t && t.ref ? n && a ? d(a) ? a.concat(_i(t)) : [a, _i(t)] : _i(t) : a,
		scopeId: e.scopeId,
		slotScopeIds: e.slotScopeIds,
		children: s,
		target: e.target,
		targetStart: e.targetStart,
		targetAnchor: e.targetAnchor,
		staticCount: e.staticCount,
		shapeFlag: e.shapeFlag,
		patchFlag: t && e.type !== q ? o === -1 ? 16 : o | 16 : o,
		dynamicProps: e.dynamicProps,
		dynamicChildren: e.dynamicChildren,
		appContext: e.appContext,
		dirs: e.dirs,
		transition: c,
		component: e.component,
		suspense: e.suspense,
		ssContent: e.ssContent && xi(e.ssContent),
		ssFallback: e.ssFallback && xi(e.ssFallback),
		placeholder: e.placeholder,
		el: e.el,
		anchor: e.anchor,
		ctx: e.ctx,
		ce: e.ce
	};
	return c && r && Tn(u, c.clone(u)), u;
}
function Si(e = " ", t = 0) {
	return Y(si, null, e, t);
}
function X(e) {
	return e == null || typeof e == "boolean" ? Y(ci) : d(e) ? Y(q, null, e.slice()) : mi(e) ? Ci(e) : Y(si, null, String(e));
}
function Ci(e) {
	return e.el === null && e.patchFlag !== -1 || e.memo ? e : xi(e);
}
function wi(e, t) {
	let n = 0, { shapeFlag: r } = e;
	if (t == null) t = null;
	else if (d(t)) n = 16;
	else if (typeof t == "object") {
		if (r & 65) {
			let n = t.default;
			n && (n._c && (n._d = !1), wi(e, n()), n._c && (n._d = !0));
			return;
		}
		{
			n = 32;
			let r = t._;
			!r && !Nr(t) ? t._ctx = U : r === 3 && U && (U.slots._ === 1 ? t._ = 1 : (t._ = 2, e.patchFlag |= 1024));
		}
	} else if (h(t)) {
		if (r & 65) {
			wi(e, { default: t });
			return;
		}
		t = {
			default: t,
			_ctx: U
		}, n = 32;
	} else t = String(t), r & 64 ? (n = 16, t = [Si(t)]) : n = 8;
	e.children = t, e.shapeFlag |= n;
}
function Ti(...e) {
	let t = {};
	for (let n = 0; n < e.length; n++) {
		let r = e[n];
		for (let e in r) if (e === "class") t.class !== r.class && (t.class = k([t.class, r.class]));
		else if (e === "style") t.style = ue([t.style, r.style]);
		else if (a(e)) {
			let n = t[e], i = r[e];
			i && n !== i && !(d(n) && n.includes(i)) ? t[e] = n ? [].concat(n, i) : i : i == null && n == null && !o(e) && (t[e] = i);
		} else e !== "" && (t[e] = r[e]);
	}
	return t;
}
function Z(e, t, n, r = null) {
	B(e, t, 7, [n, r]);
}
var Ei = hr(), Di = 0;
function Oi(e, n, r) {
	let i = e.type, a = (n ? n.appContext : e.appContext) || Ei, o = {
		uid: Di++,
		vnode: e,
		type: i,
		parent: n,
		appContext: a,
		root: null,
		next: null,
		subTree: null,
		effect: null,
		update: null,
		job: null,
		scope: new be(!0),
		render: null,
		proxy: null,
		exposed: null,
		exposeProxy: null,
		withProxy: null,
		provides: n ? n.provides : Object.create(a.provides),
		ids: n ? n.ids : [
			"",
			0,
			0
		],
		accessCache: null,
		renderCache: [],
		components: null,
		directives: null,
		propsOptions: zr(i, a),
		emitsOptions: Sr(i, a),
		emit: null,
		emitted: null,
		propsDefaults: t,
		inheritAttrs: i.inheritAttrs,
		ctx: t,
		data: t,
		props: t,
		attrs: t,
		slots: t,
		refs: t,
		setupState: t,
		setupContext: null,
		suspense: r,
		suspenseId: r ? r.pendingId : 0,
		asyncDep: null,
		asyncResolved: !1,
		isMounted: !1,
		isUnmounted: !1,
		isDeactivated: !1,
		bc: null,
		c: null,
		bm: null,
		m: null,
		bu: null,
		u: null,
		um: null,
		bum: null,
		da: null,
		a: null,
		rtg: null,
		rtc: null,
		ec: null,
		sp: null
	};
	return o.ctx = { _: o }, o.root = n ? n.root : o, o.emit = br.bind(null, o), e.ce && e.ce(o), o;
}
var Q = null, ki = () => Q || U, Ai, ji;
{
	let e = le(), t = (t, n) => {
		let r;
		return (r = e[t]) || (r = e[t] = []), r.push(n), (e) => {
			r.length > 1 ? r.forEach((t) => t(e)) : r[0](e);
		};
	};
	Ai = t("__VUE_INSTANCE_SETTERS__", (e) => Q = e), ji = t("__VUE_SSR_SETTERS__", (e) => Fi = e);
}
var Mi = (e) => {
	let t = Q;
	return Ai(e), e.scope.on(), () => {
		e.scope.off(), Ai(t);
	};
}, Ni = () => {
	Q && Q.scope.off(), Ai(null);
};
function Pi(e) {
	return e.vnode.shapeFlag & 4;
}
var Fi = !1;
function Ii(e, t = !1, n = !1) {
	t && ji(t);
	let { props: r, children: i } = e.vnode, a = Pi(e);
	Pr(e, r, a, t), qr(e, i, n || t);
	let o = a ? Li(e, t) : void 0;
	return t && ji(!1), o;
}
function Li(e, t) {
	let n = e.type;
	e.accessCache = /* @__PURE__ */ Object.create(null), e.proxy = new Proxy(e.ctx, $n);
	let { setup: r } = n;
	if (r) {
		N();
		let n = e.setupContext = r.length > 1 ? Ui(e) : null, i = Mi(e), a = Kt(r, e, 0, [e.props, n]), o = y(a);
		if (Le(), i(), (o || e.sp) && !Mn(e) && Dn(e), o) {
			if (a.then(Ni, Ni), t) return a.then((n) => {
				Ri(e, n, t);
			}).catch((t) => {
				qt(t, e, 0);
			});
			e.asyncDep = a;
		} else Ri(e, a, t);
	} else Vi(e, t);
}
function Ri(e, t, n) {
	h(t) ? e.type.__ssrInlineRender ? e.ssrRender = t : e.render = t : v(t) && (e.setupState = Lt(t)), Vi(e, n);
}
var zi, Bi;
function Vi(e, t, n) {
	let i = e.type;
	if (!e.render) {
		if (!t && zi && !i.render) {
			let t = i.template || or(e).template;
			if (t) {
				let { isCustomElement: n, compilerOptions: r } = e.appContext.config, { delimiters: a, compilerOptions: o } = i;
				i.render = zi(t, s(s({
					isCustomElement: n,
					delimiters: a
				}, r), o));
			}
		}
		e.render = i.render || r, Bi && Bi(e);
	}
	{
		let t = Mi(e);
		N();
		try {
			nr(e);
		} finally {
			Le(), t();
		}
	}
}
var Hi = { get(e, t) {
	return P(e, "get", ""), e[t];
} };
function Ui(e) {
	return {
		attrs: new Proxy(e.attrs, Hi),
		slots: e.slots,
		emit: e.emit,
		expose: (t) => {
			e.exposed = t || {};
		}
	};
}
function Wi(e) {
	return e.exposed ? e.exposeProxy ||= new Proxy(Lt(Mt(e.exposed)), {
		get(t, n) {
			if (n in t) return t[n];
			if (n in Zn) return Zn[n](e);
		},
		has(e, t) {
			return t in e || t in Zn;
		}
	}) : e.proxy;
}
function Gi(e) {
	return h(e) && "__vccOpts" in e;
}
var Ki = (e, t) => /* @__PURE__ */ zt(e, t, Fi);
function qi(e, t, n) {
	try {
		pi(-1);
		let r = arguments.length;
		return r === 2 ? v(t) && !d(t) ? mi(t) ? Y(e, null, [t]) : Y(e, t) : Y(e, null, t) : (r > 3 ? n = Array.prototype.slice.call(arguments, 2) : r === 3 && mi(n) && (n = [n]), Y(e, t, n));
	} finally {
		pi(1);
	}
}
var Ji = "3.5.40", Yi = void 0, Xi = typeof window < "u" && window.trustedTypes;
if (Xi) try {
	Yi = /* @__PURE__ */ Xi.createPolicy("vue", { createHTML: (e) => e });
} catch {}
var Zi = Yi ? (e) => Yi.createHTML(e) : (e) => e, Qi = "http://www.w3.org/2000/svg", $i = "http://www.w3.org/1998/Math/MathML", $ = typeof document < "u" ? document : null, ea = $ && /* @__PURE__ */ $.createElement("template"), ta = {
	insert: (e, t, n) => {
		t.insertBefore(e, n || null);
	},
	remove: (e) => {
		let t = e.parentNode;
		t && t.removeChild(e);
	},
	createElement: (e, t, n, r) => {
		let i = t === "svg" ? $.createElementNS(Qi, e) : t === "mathml" ? $.createElementNS($i, e) : n ? $.createElement(e, { is: n }) : $.createElement(e);
		return e === "select" && r && r.multiple != null && i.setAttribute("multiple", r.multiple), i;
	},
	createText: (e) => $.createTextNode(e),
	createComment: (e) => $.createComment(e),
	setText: (e, t) => {
		e.nodeValue = t;
	},
	setElementText: (e, t) => {
		e.textContent = t;
	},
	parentNode: (e) => e.parentNode,
	nextSibling: (e) => e.nextSibling,
	querySelector: (e) => $.querySelector(e),
	setScopeId(e, t) {
		e.setAttribute(t, "");
	},
	insertStaticContent(e, t, n, r, i, a) {
		let o = n ? n.previousSibling : t.lastChild;
		if (i && (i === a || i.nextSibling)) for (; t.insertBefore(i.cloneNode(!0), n), !(i === a || !(i = i.nextSibling)););
		else {
			ea.innerHTML = Zi(r === "svg" ? `<svg>${e}</svg>` : r === "mathml" ? `<math>${e}</math>` : e);
			let i = ea.content;
			if (r === "svg" || r === "mathml") {
				let e = i.firstChild;
				for (; e.firstChild;) i.appendChild(e.firstChild);
				i.removeChild(e);
			}
			t.insertBefore(i, n);
		}
		return [o ? o.nextSibling : t.firstChild, n ? n.previousSibling : t.lastChild];
	}
}, na = /* @__PURE__ */ Symbol("_vtc");
function ra(e, t, n) {
	let r = e[na];
	r && (t = (t ? [t, ...r] : [...r]).join(" ")), t == null ? e.removeAttribute("class") : n ? e.setAttribute("class", t) : e.className = t;
}
var ia = /* @__PURE__ */ Symbol("_vod"), aa = /* @__PURE__ */ Symbol("_vsh"), oa = /* @__PURE__ */ Symbol(""), sa = /(?:^|;)\s*display\s*:/;
function ca(e, t, n) {
	let r = e.style, i = g(n), a = !1;
	if (n && !i) {
		if (t) {
			if (g(t)) for (let e of t.split(";")) {
				let t = e.slice(0, e.indexOf(":")).trim();
				n[t] ?? ua(r, t, "");
			}
			else for (let e in t) n[e] ?? ua(r, e, "");
		}
		for (let i in n) {
			i === "display" && (a = !0);
			let o = n[i];
			o == null ? ua(r, i, "") : ma(e, i, !g(t) && t ? t[i] : void 0, o) || ua(r, i, o);
		}
	} else if (i) {
		if (t !== n) {
			let e = r[oa];
			e && (n += ";" + e), r.cssText = n, a = sa.test(n);
		}
	} else t && e.removeAttribute("style");
	ia in e && (e[ia] = a ? r.display : "", e[aa] && (r.display = "none"));
}
var la = /\s*!important$/;
function ua(e, t, n) {
	if (d(n)) n.forEach((n) => ua(e, t, n));
	else if (n ??= "", t.startsWith("--")) e.setProperty(t, n);
	else {
		let r = pa(e, t);
		la.test(n) ? e.setProperty(E(r), n.replace(la, ""), "important") : e[r] = n;
	}
}
var da = [
	"Webkit",
	"Moz",
	"ms"
], fa = {};
function pa(e, t) {
	let n = fa[t];
	if (n) return n;
	let r = T(t);
	if (r !== "filter" && r in e) return fa[t] = r;
	r = ie(r);
	for (let n = 0; n < da.length; n++) {
		let i = da[n] + r;
		if (i in e) return fa[t] = i;
	}
	return t;
}
function ma(e, t, n, r) {
	return e.tagName === "TEXTAREA" && (t === "width" || t === "height") && g(r) && n === r;
}
var ha = "http://www.w3.org/1999/xlink";
function ga(e, t, n, r, i, a = ge(t)) {
	r && t.startsWith("xlink:") ? n == null ? e.removeAttributeNS(ha, t.slice(6, t.length)) : e.setAttributeNS(ha, t, n) : n == null || a && !_e(n) ? e.removeAttribute(t) : e.setAttribute(t, a ? "" : _(n) ? String(n) : n);
}
function _a(e, t, n, r, i) {
	if (t === "innerHTML" || t === "textContent") {
		n != null && (e[t] = t === "innerHTML" ? Zi(n) : n);
		return;
	}
	let a = e.tagName;
	if (t === "value" && a !== "PROGRESS" && !a.includes("-")) {
		let r = a === "OPTION" ? e.getAttribute("value") || "" : e.value, i = n == null ? e.type === "checkbox" ? "on" : "" : String(n);
		(r !== i || !("_value" in e)) && (e.value = i), n ?? e.removeAttribute(t), e._value = n;
		return;
	}
	let o = !1;
	if (n === "" || n == null) {
		let r = typeof e[t];
		r === "boolean" ? n = _e(n) : n == null && r === "string" ? (n = "", o = !0) : r === "number" && (n = 0, o = !0);
	}
	try {
		e[t] = n;
	} catch {}
	o && e.removeAttribute(i || t);
}
function va(e, t, n, r) {
	e.addEventListener(t, n, r);
}
function ya(e, t, n, r) {
	e.removeEventListener(t, n, r);
}
var ba = /* @__PURE__ */ Symbol("_vei");
function xa(e, t, n, r, i = null) {
	let a = e[ba] || (e[ba] = {}), o = a[t];
	if (r && o) o.value = r;
	else {
		let [n, s] = wa(t);
		r ? va(e, n, a[t] = Oa(r, i), s) : o && (ya(e, n, o, s), a[t] = void 0);
	}
}
var Sa = /(Once|Passive|Capture)$/, Ca = /^on:?(?:Once|Passive|Capture)$/;
function wa(e) {
	let t, n;
	for (; (n = e.match(Sa)) && !Ca.test(e);) t ||= {}, e = e.slice(0, e.length - n[1].length), t[n[1].toLowerCase()] = !0;
	return [e[2] === ":" ? e.slice(3) : E(e.slice(2)), t];
}
var Ta = 0, Ea = /* @__PURE__ */ Promise.resolve(), Da = () => Ta ||= (Ea.then(() => Ta = 0), Date.now());
function Oa(e, t) {
	let n = (e) => {
		if (!e._vts) e._vts = Date.now();
		else if (e._vts <= n.attached) return;
		let r = n.value;
		if (d(r)) {
			let n = e.stopImmediatePropagation;
			e.stopImmediatePropagation = () => {
				n.call(e), e._stopped = !0;
			};
			let i = r.slice(), a = [e];
			for (let n = 0; n < i.length && !e._stopped; n++) {
				let e = i[n];
				e && B(e, t, 5, a);
			}
		} else B(r, t, 5, [e]);
	};
	return n.value = e, n.attached = Da(), n;
}
var ka = (e) => e.charCodeAt(0) === 111 && e.charCodeAt(1) === 110 && e.charCodeAt(2) > 96 && e.charCodeAt(2) < 123, Aa = (e, t, n, r, i, s) => {
	let c = i === "svg";
	t === "class" ? ra(e, r, c) : t === "style" ? ca(e, n, r) : a(t) ? o(t) || xa(e, t, n, r, s) : (t[0] === "." ? (t = t.slice(1), !0) : t[0] === "^" ? (t = t.slice(1), !1) : ja(e, t, r, c)) ? (_a(e, t, r), !e.tagName.includes("-") && (t === "value" || t === "checked" || t === "selected") && ga(e, t, r, c, s, t !== "value")) : e._isVueCE && (Ma(e, t) || e._def.__asyncLoader && (/[A-Z]/.test(t) || !g(r))) ? _a(e, T(t), r, s, t) : (t === "true-value" ? e._trueValue = r : t === "false-value" && (e._falseValue = r), ga(e, t, r, c));
};
function ja(e, t, n, r) {
	if (r) return !!(t === "innerHTML" || t === "textContent" || t in e && ka(t) && h(n));
	if (t === "spellcheck" || t === "draggable" || t === "translate" || t === "autocorrect" || t === "sandbox" && e.tagName === "IFRAME" || t === "form" || t === "list" && e.tagName === "INPUT" || t === "type" && e.tagName === "TEXTAREA") return !1;
	if (t === "width" || t === "height") {
		let t = e.tagName;
		if (t === "IMG" || t === "VIDEO" || t === "CANVAS" || t === "SOURCE") return !1;
	}
	return ka(t) && g(n) ? !1 : t in e;
}
function Ma(e, t) {
	let n = e._def.props;
	if (!n) return !1;
	let r = T(t);
	return Array.isArray(n) ? n.some((e) => T(e) === r) : Object.keys(n).some((e) => T(e) === r);
}
var Na = /* @__PURE__ */ s({ patchProp: Aa }, ta), Pa;
function Fa() {
	return Pa ||= Yr(Na);
}
var Ia = ((...e) => {
	let t = Fa().createApp(...e), { mount: n } = t;
	return t.mount = (e) => {
		let r = Ra(e);
		if (!r) return;
		let i = t._component;
		!h(i) && !i.render && !i.template && (i.template = r.innerHTML), r.nodeType === 1 && (r.textContent = "");
		let a = n(r, !1, La(r));
		return r instanceof Element && (r.removeAttribute("v-cloak"), r.setAttribute("data-v-app", "")), a;
	}, t;
});
function La(e) {
	if (e instanceof SVGElement) return "svg";
	if (typeof MathMLElement == "function" && e instanceof MathMLElement) return "mathml";
}
function Ra(e) {
	return g(e) ? document.querySelector(e) : e;
}
//#endregion
//#region src/CompatibilityBoundary.ts
var za = /* @__PURE__ */ En({
	name: "TVTrackerCompatibilityBoundary",
	setup() {
		return () => qi("span", {
			"data-tv-modern-boundary": "ready",
			hidden: !0
		});
	}
}), Ba = Object.freeze({
	ACTIONABLE: "ACTIONABLE",
	VISIBLE_SERVICE_PROBLEM: "VISIBLE_SERVICE_PROBLEM",
	RECOVERABLE_BACKGROUND_FAILURE: "RECOVERABLE_BACKGROUND_FAILURE",
	TECHNICAL_DETAIL: "TECHNICAL_DETAIL"
});
function Va(e, t) {
	if (Number.isFinite(Number(t))) return Number(t);
	if (e && typeof e == "object" && "status" in e) {
		let t = Number(e.status);
		return Number.isFinite(t) ? t : null;
	}
	return null;
}
function Ha(e) {
	if (!e || typeof e != "object" || !("code" in e)) return "";
	let t = e.code;
	return typeof t == "string" ? t.slice(0, 120) : "";
}
function Ua(e) {
	return e instanceof Error && /failed to fetch|networkerror|network request|econnreset|econnrefused|enotfound|etimedout/i.test(e.message);
}
function Wa(e, t = {}) {
	let n = Va(e, t.status), r = Ua(e) || n === 429 || n !== null && n >= 500;
	return t.background === !0 && r ? {
		classification: Ba.RECOVERABLE_BACKGROUND_FAILURE,
		status: n,
		code: Ha(e),
		safeMessage: "",
		retryable: !0,
		original: e
	} : n !== null && [
		400,
		401,
		403,
		404,
		409,
		422
	].includes(n) ? {
		classification: Ba.ACTIONABLE,
		status: n,
		code: Ha(e),
		safeMessage: "Couldn’t complete that request. Check the details and try again.",
		retryable: n === 409,
		original: e
	} : r ? {
		classification: Ba.VISIBLE_SERVICE_PROBLEM,
		status: n,
		code: Ha(e),
		safeMessage: "TV Tracker can’t reach the service right now. Try again.",
		retryable: !0,
		original: e
	} : {
		classification: Ba.TECHNICAL_DETAIL,
		status: n,
		code: Ha(e),
		safeMessage: "Something went wrong. Try again.",
		retryable: !1,
		original: e
	};
}
//#endregion
//#region src/core/api.ts
var Ga = /* @__PURE__ */ new Set([
	"GET",
	"HEAD",
	"OPTIONS"
]);
function Ka() {
	return document.querySelector("meta[name=\"csrf-token\"]")?.content || "";
}
function qa(e) {
	if (!e || typeof e != "object" || !("code" in e)) return "";
	let t = e.code;
	return typeof t == "string" ? t.slice(0, 120) : "";
}
var Ja = class extends Error {
	status;
	code;
	payload;
	classified;
	constructor(e, t) {
		super(`TV Tracker API request failed (${e})`), this.name = "ApiRequestError", this.status = e, this.code = qa(t), this.payload = t, this.classified = Wa(this, { status: e });
	}
};
async function Ya(e) {
	if (!(e.headers.get("content-type") || "").toLowerCase().includes("application/json")) return null;
	try {
		return await e.json();
	} catch {
		return null;
	}
}
var Xa = Object.freeze(new class {
	async request(e, t = {}) {
		if (!e.startsWith("/") || e.startsWith("//")) throw TypeError("API paths must be same-origin absolute paths");
		let n = String(t.method || "GET").toUpperCase(), r = new Headers(t.headers || {});
		if (r.set("Accept", "application/json"), !Ga.has(n)) {
			let e = Ka();
			e && r.set("X-CSRF-Token", e), t.body != null && !r.has("Content-Type") && typeof t.body == "string" && r.set("Content-Type", "application/json");
		}
		let i;
		try {
			i = await fetch(e, {
				...t,
				method: n,
				headers: r,
				credentials: "same-origin"
			});
		} catch (e) {
			throw Object.assign(e instanceof Error ? e : /* @__PURE__ */ Error("Network request failed"), { classified: Wa(e) });
		}
		let a = await Ya(i);
		if (!i.ok) throw new Ja(i.status, a);
		return a;
	}
	get(e, t = {}) {
		return this.request(e, {
			...t,
			method: "GET"
		});
	}
	post(e, t, n = {}) {
		return this.request(e, {
			...n,
			method: "POST",
			body: t === void 0 ? n.body : JSON.stringify(t)
		});
	}
	patch(e, t, n = {}) {
		return this.request(e, {
			...n,
			method: "PATCH",
			body: t === void 0 ? n.body : JSON.stringify(t)
		});
	}
	delete(e, t = {}) {
		return this.request(e, {
			...t,
			method: "DELETE"
		});
	}
}());
//#endregion
//#region src/core/feedback.ts
function Za(e, t = {}) {
	let n = Wa(e, t);
	if (n.classification === Ba.RECOVERABLE_BACKGROUND_FAILURE) return;
	let r = window.TVTrackerFeedback, i = t.userMessage || n.safeMessage || "Something went wrong. Try again.";
	if (r && typeof r.reportError == "function") {
		r.reportError(e, i, { context: t.context || "modern frontend" });
		return;
	}
	console.error("[TV Tracker] modern frontend error", {
		classification: n.classification,
		status: n.status,
		code: n.code
	});
}
//#endregion
//#region src/domains/settings/index.ts
var Qa = [
	"profile",
	"auth",
	"notifications",
	"streaming",
	"data",
	"danger-zone"
], $a = {
	profile: "PROFILE",
	auth: "AUTH",
	notifications: "NOTIFICATIONS",
	streaming: "STREAMING",
	data: "DATA",
	"danger-zone": "DANGER ZONE"
}, eo = new Set(Qa);
function to(e) {
	let t = String(e || "profile").trim().toLowerCase();
	return eo.has(t) ? t : "profile";
}
function no(e) {
	return to(String(e || "").match(/^\/app\/settings(?:\/([^/?#]+))?\/?$/)?.[1]);
}
function ro(e) {
	return `/app/settings/${to(e)}`;
}
function io() {
	let e = document.getElementById("settings-content");
	e && (e.dataset.settingsOwner = "modern");
}
function ao() {
	let e = window.TVTrackerSettings;
	if (!e || e.__modernOwner === !0) return e;
	let t = Object.freeze(Qa.map((e) => Object.freeze({
		id: e,
		label: $a[e]
	}))), n = Object.freeze({
		__modernOwner: !0,
		sections: t,
		render() {
			io(), e.render(), io();
		},
		open(t = "profile", n = {}) {
			let r = to(t);
			io(), e.open(r, n), io();
		},
		current() {
			return to(e.current());
		},
		normalizeSection: to,
		routeFor: ro,
		sectionFromPath: no
	});
	return window.TVTrackerSettings = n, io(), n;
}
//#endregion
//#region src/main.ts
var oo = ao(), so = Object.freeze({
	version: "phase14-v1",
	api: Xa,
	classifyError: Wa,
	presentError: Za,
	settings: oo
});
window.TVTrackerModern || Object.defineProperty(window, "TVTrackerModern", {
	value: so,
	writable: !1,
	configurable: !1,
	enumerable: !1
});
var co = document.querySelector("[data-tv-modern-root]");
co && co.dataset.tvModernMounted !== "true" && (Ia(za).mount(co), co.dataset.tvModernMounted = "true");
//#endregion
