var va = (function () {
'use strict';

function C(re, im) {
	this.re = re;
	this.im = im;
}
C.ZERO = new C(0.0, 0.0);

C.expj = function (x) {
	return new C(Math.cos(x), Math.sin(x));
};

C.prototype.abs2 = function () {
	return this.re * this.re + this.im * this.im;
};
C.prototype.arg = function () {
	return Math.atan2(this.im, this.re);
};

C.prototype.plus = function (c) {
	return new C(this.re + c.re, this.im + c.im);
};
C.prototype.minus = function (c) {
	return new C(this.re - c.re, this.im - c.im);
};
C.prototype.multiply = function (c, conjugate) {
	var im = conjugate ? -c.im : c.im;
	return new C(
		this.re * c.re - this.im * im,
		this.re * im + this.im * c.re);
};

var r = [0, 0];
var w = [null];
function fftr(n) {
	for (var nh = r.length >> 1; nh < n; nh <<= 1) {
		for (var i = 0; i < nh; i++) {
			r[(i | nh) << 1] = r[i | nh];
			r[(i | nh) << 1 | 1] = r[i | nh] | nh;
		}
	}
	return r;
}
function fftw(n) {
	for (var nh = w.length; nh < n; nh <<= 1) {
		for (var i = 0; i < nh; i++) {
			w[i | nh] = C.expj(i / nh * Math.PI);
		}
	}
	return w;
}

function fftin(a, n, c) {
	var w = fftw(n);
	for (var nh = 1; nh < n; nh <<= 1) {
		for (var s = 0; s < n; s += nh << 1) {
			for (var i = 0; i < nh; i++) {
				var j = i | s, k = j | nh;
				var l = a[j], rw = a[k].multiply(w[i | nh], c);
				a[j] = l.plus(rw);
				a[k] = l.minus(rw);
			}
		}
	}
	return a;
}

function fft(a) {
	var n = a.length;
	var f = fftin(a, n, true);
	/* for (var i = 0 ; i < n; i++) {
		var fi = f[i];
		f[i] = new C(fi.re / n, fi.im / n);
	} */
	return f;
}
function ifft(a) {
	var n = a.length;
	var f = fftin(a, n, false);
	return f;
}

function rfft(x, n) {
	var r = fftr(n);
	var a = [];
	a.length = n;
	for (var i = 0; i < n; i++) {
		var j = r[i | n];
		a[i] = j < x.length ? new C(x[j], 0.0) : C.ZERO;
	}
	return fft(a);
}

function autocor(y, l, m) {
	var length = m == null ? 512 : m;
	var n = length * 2;
	
	var r = fftr(n);
	var x = [];
	x.length = n;
	for (var i = 0; i < n; i++) {
		var j = r[i | n];
		if (j < length) {
			var f0 = j / length * l;
			var f1 = (j + 1) / length * l;
			var i0 = Math.floor(f0);
			var i1 = Math.floor(f1);
			var p = 0.0;
			for (var k = i0; k <= i1 && k < y.length; k++) {
				var d = k == i1 ? f1 - i1 : 1.0;
				if (k == i0) {
					d -= f0 - i0;
				}
				if (d > 0.0) {
					p += Math.pow(10, y[k] * 0.1) * d;
				}
			}
			x[i] = new C(p, 0.0);
		} else {
			x[i] = C.ZERO;
		}
	}
	return ifft(x);
}

function fundamental(cor, fs) {
	var x, y;
	var length = cor.length / 2;
	for (var i = 1; i < length; i++) {
		var c = cor[i].re;
		if (c > (y == null ? cor[i - 1].re : y)) {
			x = i;
			y = c;
		}
	}
	return x == null ? null : fs / x;
}

function Parcor(residue, alpha, ref) {
	this.residue = residue;
	this.alpha = alpha;
	
	var s = 1.0;
	for (var i = ref.length - 1; i >= 0; i--) {
		var r = ref[i];
		s *= (1.0 + r) / (1.0 - r);
		ref[i] = Math.sqrt(s);
	}
	this.sqrtS = ref;
}

function parcor(cor, p) {
	var k = [];
	k.length = p;
	
	var a = [1.0];
	a.length = p + 1;
	
	var res = cor[0].re;
	if (res != 0.0) {
		var i, j;
		for (i = 1; i <= p; i++) {
			var r = cor[i].re;
			for (j = 1; j < i; j++) {
				r += a[j] * cor[i - j].re;
			}
			r /= res;
			k[i - 1] = r;
			a[i] = -r;
			for (j = 1; j <= i - j; j++) {
				var aj = a[j];
				a[j] -= r * a[i - j];
				if (j != i - j) {
					a[i - j] -= r * aj;
				}
			}
			res *= (1.0 - r) * (1.0 + r);
		}
	}
	return new Parcor(res, a, k);
}

function Series(array, fs) {
	this.array = array;
	this.length = array.length;
	this.w = fs / (this.length * 2.0);
}
Series.prototype.getH = function (i) {
	return this.array[i];
};
Series.prototype.getW = function (i) {
	return this.w * i;
};

function freqz(b2, a, fs, n) {
	var length = n == null ? 512 : n;
	var c = Math.log10(b2);
	var fa = rfft(a, length * 2);
	
	var h = [];
	h.length = length;
	for (var i = 0; i < length; i++) {
		h[i] = (c - Math.log10(fa[i].abs2())) * 10.0;
	}
	return new Series(h, fs);
}

function peaks(s) {
	var a = [];
	for (var i = 2; i < s.length; i++) {
		var h0 = s.getH(i - 2);
		var h1 = s.getH(i - 1);
		var h2 = s.getH(i);
		if (h0 < h1 && h1 > h2) {
			a.push(s.getW(i - 1));
		}
	}
	return a;
}

function filter(f, s) {
	var a = [];
	for (var i = 2; i < s.length; i++) {
		var h0 = s.getH(i - 2);
		var h1 = s.getH(i - 1);
		var h2 = s.getH(i);
		var dh0_5 = h1 - h0;
		var dh1_5 = h2 - h1;
		if (dh0_5 > dh1_5) {
			var w0 = s.getW(i - 2);
			var w2 = s.getW(i);
			for (var j = 0; j < f.length; ) {
				var w = f[j];
				if (w0 < w && w < w2) {
					a.push(w);
					f.splice(j, 1);
				} else {
					j++;
				}
			}
		}
	}
	return a;
}

function Matrix(n) {
	this.n = n;
	this.array = [];
	this.array.length = n * n;
}
Matrix.prototype.get = function (i, j) {
	return this.array[this.n * i + j];
};
Matrix.prototype.set = function (i, j, value) {
	this.array[this.n * i + j] = value;
};

var eps = Number.EPSILON;

function orthes(ortho, a) {
	var n = a.n;
	var low = 0;
	var high = n - 1;
	
	var i, j, m;
	var f;
	for (m = low + 1; m <= high - 1; m++) {
		var scale = 0.0;
		for (i = m; i <= high; i++) {
			scale += Math.abs(a.get(i, m - 1));
		}
		if (scale == 0.0) continue;
		
		var h = 0.0;
		for (i = high; i >= m; i--) {
			f = a.get(i, m - 1) / scale;
			ortho[i] = f;
			h += f * f;
		}
		var g = Math.sqrt(h);
		if (ortho[m] > 0) {
			g = -g;
		}
		h -= ortho[m] * g;
		ortho[m] -= g;
		
		for (j = m; j < n; j++) {
			f = 0.0;
			for (i = high; i >= m; i--) {
				f += ortho[i] * a.get(i, j);
			}
			f /= h;
			for (i = m; i <= high; i++) {
				a.set(i, j, a.get(i, j) - f * ortho[i]);
			}
		}
		
		for (i = 0; i <= high; i++) {
			f = 0.0;
			for (j = high; j >= m; j--) {
				f += ortho[j] * a.get(i, j);
			}
			f /= h;
			for (j = m; j <= high; j++) {
				a.set(i, j, a.get(i, j) - f * ortho[j]);
			}
		}
		a.set(m, m - 1, scale * g);
	}
}

function hqr2(lambda, a) {
	var nn = a.n;
	var low = 0;
	// var high = nn - 1;
	
	var i, j, k;
	var exshift = 0.0;
	var p = 0.0, q = 0.0, r = 0.0, s, z;
	
	var norm = 0.0;
	for (i = 0; i < nn; i++) {
		for (j = Math.max(i - 1, 0); j < nn; j++) {
			norm += Math.abs(a.get(i, j));
		}
	}
	
	var n = nn - 1;
	var iter = 0;
	while (n >= low) {
		var l = n;
		for (; l > low; l--) {
			s = Math.abs(a.get(l - 1, l - 1)) + Math.abs(a.get(l, l));
			if (s == 0.0) {
				s = norm;
			}
			if (Math.abs(a.get(l, l - 1)) < eps * s) break;
		}
		
		var x = a.get(n, n);
		if (l == n) {
			lambda[n] = new C(x + exshift, 0.0);
			n--;
			iter = 0;
			continue;
		}
		
		var y = a.get(n - 1, n - 1);
		var w = a.get(n, n - 1) * a.get(n - 1, n);
		if (l == n - 1) {
			p = (y - x) / 2.0;
			q = p * p + w;
			z = Math.sqrt(Math.abs(q));
			x += exshift;
			
			if (q >= 0) {
				z = p >= 0 ? p + z : p - z;
				lambda[n - 1] = new C(x + z, 0.0);
				lambda[n] = new C(z != 0.0 ? x - w / z : x, 0.0);
			} else {
				lambda[n - 1] = new C(x + p, z);
				lambda[n] = new C(x + p, -z);
			}
			n -= 2;
			iter = 0;
			continue;
		}
		
		if (iter == 10) {
			exshift += x;
			for (i = low; i <= n; i++) {
				a.set(i, i, a.get(i, i) - x);
			}
			s = Math.abs(a.get(n, n - 1)) + Math.abs(a.get(n - 1, n - 2));
			x = y = 0.75 * s;
			w = -0.4375 * s * s;
		}
		
		if (iter == 30) {
			s = (y - x) / 2.0;
			s = s * s + w;
			if (s > 0) {
				s = Math.sqrt(s);
				if (y < x) {
					s = -s;
				}
				s = x - w / ((y - x) / 2.0 + s);
				for (i = low; i <= n; i++) {
					a.set(i, i, a.get(i, i) - s);
				}
				exshift += s;
				x = y = w = 0.964;
			}
		}
		
		if (iter++ == 50) {
			// throw new Error('too many iterations');
			break;
		}
		
		var m = n - 2;
		for (; m >= l; m--) {
			z = a.get(m, m);
			r = x - z;
			s = y - z;
			p = (r * s - w) / a.get(m + 1, m) + a.get(m, m + 1);
			q = a.get(m + 1, m + 1) - z - r - s;
			r = a.get(m + 2, m + 1);
			s = Math.abs(p) + Math.abs(q) + Math.abs(r);
			p /= s;
			q /= s;
			r /= s;
			if (m == l) break;
			if (Math.abs(a.get(m, m - 1)) * (Math.abs(q) + Math.abs(r)) <
				eps * (Math.abs(p) * (
					Math.abs(a.get(m - 1, m - 1)) + Math.abs(z) +
					Math.abs(a.get(m + 1, m + 1))
				))
			) break;
		}
		
		for (i = m + 2; i <= n; i++) {
			a.set(i, i - 2, 0.0);
			if (i > m + 2) {
				a.set(i, i - 3, 0.0);
			}
		}
		
		for (k = m; k <= n - 1; k++) {
			var notlast = k != n - 1;
			if (k != m) {
				p = a.get(k, k - 1);
				q = a.get(k + 1, k - 1);
				r = notlast ? a.get(k + 2, k - 1) : 0.0;
				x = Math.abs(p) + Math.abs(q) + Math.abs(r);
				if (x != 0.0) {
					p /= x;
					q /= x;
					r /= x;
				}
			}
			if (x == 0.0) break;
			
			s = Math.sqrt(p * p + q * q + r * r);
			if (p < 0.0) {
				s = -s;
			}
			if (s == 0.0) continue;
			
			if (k != m) {
				a.set(k, k - 1, -s * x);
			} else if (l != m) {
				a.set(k, k - 1, -a.get(k, k - 1));
			}
			p += s;
			x = p / s;
			y = q / s;
			z = r / s;
			q /= p;
			r /= p;
			
			for (j = n; j >= k; j--) {
				p = a.get(k, j) + q * a.get(k + 1, j);
				if (notlast) {
					p += r * a.get(k + 2, j);
					a.set(k + 2, j, a.get(k + 2, j) - p * z);
				}
				a.set(k + 1, j, a.get(k + 1, j) - p * y);
				a.set(k, j, a.get(k, j) - p * x);
			}
			
			for (i = Math.min(n, k + 3); i >= low; i--) {
				p = x * a.get(i, k) + y * a.get(i, k + 1);
				if (notlast) {
					p += z * a.get(i, k + 2);
					a.set(i, k + 2, a.get(i, k + 2) - p * r);
				}
				a.set(i, k + 1, a.get(i, k + 1) - p * q);
				a.set(i, k, a.get(i, k) - p);
			}
		}
	}
}

function eigvals(a, length) {
	var n = a.n;
	
	var ortho = [];
	ortho.length = n;
	orthes(ortho, a);
	
	var lambda = [];
	lambda.length = n + length;
	hqr2(lambda, a);
	/*
	for (var i = 0; i < lambda.length; i++) {
		if (lambda[i] == null) {
			lambda[i] = C.ZERO;
		}
	}
	*/
	return lambda;
}

function roots(p) {
	var i, j;
	for (i = 0; i < p.length; i++) {
		if (p[i] != 0.0) break;
	}
	for (j = p.length - 1; j > i; j--) {
		if (p[j] != 0.0) break;
	}
	var index = i, n = j - index;
	if (n == -1) {
		return [];
	}
	
	var a = new Matrix(n);
	for (i = 0; i < n - 1; i++) {
		for (j = 0; j < n; j++) {
			a.set(i, j, i + 1 == j ? 1.0 : 0.0);
		}
	}
	for (j = 0; j < n; j++) {
		a.set(n - 1, j, -p[index + j] / p[index + n]);
	}
	return eigvals(a, index);
}

function compare(a, b) {
	return a - b;
}
function formants(alpha, fs, freq) {
	var poles = roots(alpha);
	var w = fs / (Math.PI * 2.0);
	var f = [];
	for (var i = poles.length - 1; i >= 0; i--) {
		var p = poles[i];
		if (p != null) {
			var t = p.arg();
			if (t > 0.0) {
				f.push(t * w); // b = Math.log(p.abs2()) * w
			}
		}
	}
	return filter(f, freq).sort(compare);
}

return {
	autocor: autocor, fundamental: fundamental,
	parcor: parcor,
	Series: Series, freqz: freqz,
	peaks: peaks, formants: formants
};

})();
