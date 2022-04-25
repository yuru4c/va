var plot = (function () {
'use strict';

// BACKGROUND + ~color
var COLOR = {
	BACKGROUND: '#121212',
	LINE_MAJOR: '#515151', // silver
	LINE_MINOR: '#3e3e3e', // lightgray
	MAIN: '#7fc0ff',
	SUB: '#686868', // darkgray
	F0: '#a8a8a8', // dimgray
	FORMANT: 'lightgreen',
	SPEC: decode(
		'DBBT1MU8UM0cEMEBPEAAMFDMU9HMFf1P' +
		'AV/RzRzQxTwRPEwQM3RADwRDwQA3dA0f' +
		'F/Vzd3cFzc1T8UM1T8Uwc0QM0c1T8UM3' +
		'd0QM0c0cE8X9UM0TN0c3dE/VM3dH9UP1' +
		'TN3d3cFzdHwd3QN3QwR/UwRzQwARzEcx' +
		'DEMBX8FP1TNED9UAA8UwQwQwd3BTxDRw' +
		'DBc0AAAQwAAMEAAARzANHABDABPFDBDB' +
		'DNEDBzRMHBAADNEADxQMEDBAAMEAwQPF'
	)
};

function Base(canvas, mx, my, px, py) {
	this.canvas = canvas;
	this.cw = canvas.width;
	this.ch = canvas.height;
	this.c = canvas.getContext('2d');
	
	this.mx = mx; this.my = my;
	this.px = px; this.py = py;
	
	this.a = document.createElement('canvas');
	this.a.width = this.cw;
	this.a.height = this.ch;
	this.ac = this.a.getContext('2d');
	
	this.p = document.createElement('canvas');
	this.pw = this.cw - (mx + px + mx);
	this.ph = this.ch - (my + py + my);
	this.p.width = this.pw;
	this.p.height = this.ph;
	this.pc = this.p.getContext('2d');
	
	this.wmin = 0; this.wmax = 1; this.wlog = false;
	this.hmin = 0; this.hmax = 1; this.hlog = false;
	this.xm = 0; this.ym = 0;
}

Base.prototype.reset = function () {
	this.ac.fillStyle = 'white';
	this.ac.strokeStyle = 'silver';
	this.pc.fillStyle = 'white';
	this.pc.strokeStyle = 'white';
};

Base.prototype.x = function (w) {
	return (this.pw + this.xm) * (
		((this.wlog ? Math.log(w) : w) - this.wmin) /
		(this.wmax - this.wmin)) - 0.5 * this.xm;
};
Base.prototype.y = function (h) {
	return (this.ph + this.ym) * (
		(this.hmax - (this.hlog ? Math.log(h) : h)) /
		(this.hmax - this.hmin)) - 0.5 * this.ym;
};

Base.prototype.init = function (wmin, wmax, wlog, hmin, hmax, hlog) {
	if (wlog) {
		this.wmin = Math.log(wmin);
		this.wmax = Math.log(wmax);
	} else {
		this.wmin = wmin;
		this.wmax = wmax;
	}
	this.wlog = wlog;
	
	if (hlog) {
		this.hmin = Math.log(hmin);
		this.hmax = Math.log(hmax);
	} else {
		this.hmin = hmin;
		this.hmax = hmax;
	}
	this.hlog = hlog;
};
Base.prototype.draw = function () {
	this.c.clearRect(0, 0, this.cw, this.ch);
	this.c.drawImage(this.a, 0, 0);
};

function Prototype() { }
var base = Base.prototype;
Prototype.prototype = base;


function decode(base64) {
	var str = atob(base64);
	var code = 0x0;
	var index = 0, length = 0;
	var cd = [0, 0, 0, 0, 0, 0];
	
	var colors = [];
	colors.length = str.length * 4 / 3;
	for (var i = 0; i < colors.length; i++) {
		if (length < 6) {
			code = code << 8 | str.charCodeAt(index++);
			length += 2;
		} else {
			length -= 6;
		}
		var color = '#';
		for (var j = 2; j >= 0; j--) {
			var dd = code >> length >> 2 * j;
			var c = cd[j] += i == 0 ? dd & 0x3 :
				cd[3 + j] += dd << 30 >> 30;
			color += (c & 0xff | 0x100).toString(16).slice(-2);
		}
		colors[i] = color;
	}
	return colors;
}

function logIndexToX(i) {
	var n = Math.floor(i / 10);
	return (i - n * 10) * Math.pow(10, n);
}
function xToLogIndex(x) {
	var n = Math.floor(Math.log10(x));
	return n * 10 + x / Math.pow(10, n);
}

function Range(min, max, step) {
	if (step) {
		this.min = min;
		this.max = max;
		this.step = step;
		this.log = false;
	} else {
		this.min = xToLogIndex(min);
		this.max = xToLogIndex(max);
		this.step = 1;
		this.log = true;
	}
	this.major = false;
	this.edge = false;
}
Range.prototype.forEach = function (callback, self) {
	var i = this.log ? Math.ceil(this.min) : this.min;
	for (; i <= this.max; i += this.step) {
		var x;
		if (this.log) {
			x = logIndexToX(i);
			if (x == 0) continue;
		} else {
			x = i;
		}
		this.major = this.log ? i % 10 == 1 : i % 1000 == 0;
		this.edge = i == this.min || i == this.max;
		callback.call(self, x, i, this);
	}
};


function FFTPlot(canvas) {
	Base.call(this, canvas, 16, 8, 0, 20);
	
	this.xm = -1;
}
FFTPlot.prototype = new Prototype();

FFTPlot.prototype.init = function (wmin, wmax, wstep, hmin, hmax) {
	base.init.call(this, wmin, wmax, !wstep, hmin, hmax, false);
	this.reset();
	this.ac.clearRect(0, 0, this.cw, this.ch);
	
	this.ac.save();
	this.ac.textAlign = 'center';
	this.ac.textBaseline = 'top';
	
	new Range(wmin, wmax, wstep).forEach(function (w, i, self) {
		var x = Math.floor(this.x(w)) + 0.5;
		
		if (!self.edge) {
			this.ac.save();
			this.ac.strokeStyle = self.major ?
				COLOR.LINE_MAJOR :
				COLOR.LINE_MINOR;
			this.ac.beginPath();
			this.ac.moveTo(
				this.mx + this.px + x,
				this.my + this.ph);
			this.ac.lineTo(
				this.mx + this.px + x,
				this.my);
			this.ac.stroke();
			this.ac.restore();
		}
		
		this.ac.beginPath();
		this.ac.moveTo(
			this.mx + this.px + x,
			this.my + this.ph);
		this.ac.lineTo(
			this.mx + this.px + x,
			this.my + this.ph + (self.major ? 6 : 4) + 1.0);
		this.ac.stroke();
		
		if (self.log ? self.edge || i % 10 <= 5 : self.major) {
			this.ac.fillText(w >= (self.log ? 1000 : 10000) ?
				w / 1000 + 'k' : w + '',
				this.mx + this.px + x,
				this.my + this.ph + 10);
		}
	}, this);
	
	this.ac.restore();
	
	this.ac.beginPath();
	this.ac.moveTo(
		this.mx + this.px,
		this.my + this.ph + 0.5);
	this.ac.lineTo(
		this.mx + this.px + this.pw,
		this.my + this.ph + 0.5);
	this.ac.stroke();
};

FFTPlot.prototype.draw = function (array, f0, formants) {
	base.draw.call(this);
	this.pc.clearRect(0, 0, this.pw, this.ph);
	
	this.pc.save();
	for (var j = array.length - 1; j >= 0; j--) {
		var series = array[j];
		if (j == 0) {
			this.pc.lineWidth = 2;
			this.pc.strokeStyle = COLOR.MAIN;
		} else {
			this.pc.lineWidth = 1;
			this.pc.strokeStyle = COLOR.SUB;
		}
		this.pc.beginPath();
		for (var i = 0; i < series.length; i++) {
			var x = this.x(series.getW(i));
			var y = this.y(series.getH(i));
			if (i == 0) {
				this.pc.moveTo(x, y);
			} else {
				this.pc.lineTo(x, y);
			}
		}
		this.pc.stroke();
	}
	this.pc.restore();
	
	this.drawHighlights(f0, formants);
	this.c.drawImage(this.p, this.mx + this.px, this.my);
};

FFTPlot.prototype.drawHighlights = function (f0, formants) {
	this.pc.save();
	this.pc.setLineDash([4]);
	this.pc.lineWidth = 1;
	this.pc.textAlign = 'center';
	var x;
	if (f0 != null) {
		x = this.x(f0);
		this.pc.strokeStyle = COLOR.F0;
		this.pc.fillStyle = COLOR.F0;
		this.pc.beginPath();
		this.pc.moveTo(x, this.ph);
		this.pc.lineTo(x, 12);
		this.pc.stroke();
		this.pc.fillText('f0', x, 10);
	}
	this.pc.strokeStyle = COLOR.FORMANT;
	this.pc.fillStyle = COLOR.FORMANT;
	for (var i = 0; i < formants.length; i++) {
		x = this.x(formants[i]);
		if (i == 4) {
			this.pc.strokeStyle = COLOR.SUB;
			this.pc.fillStyle = COLOR.SUB;
		}
		this.pc.beginPath();
		this.pc.moveTo(x, this.ph);
		this.pc.lineTo(x, 12);
		this.pc.stroke();
		this.pc.fillText('F' + (i + 1), x, 10);
	}
	this.pc.restore();
};


function SpecPlot(canvas) {
	Base.call(this, canvas, 16, 8, 0, 4);
	
	this.q = document.createElement('canvas');
	this.q.width = this.pw;
	this.q.height = this.ph;
	this.qc = this.q.getContext('2d');
	
	this.o = document.createElement('canvas');
	this.o.width = this.pw;
	this.o.height = this.ph;
	this.oc = this.o.getContext('2d');
	
	this.xm = -1;
}
SpecPlot.prototype = new Prototype();

SpecPlot.prototype.color = function (h) {
	var length = COLOR.SPEC.length;
	var i = length * ((h - this.hmin) / (this.hmax - this.hmin)) >> 0;
	if (i < 0) { i = 0; }
	if (i >= length) { i = length - 1; }
	return COLOR.SPEC[i];
};
SpecPlot.prototype.point = function (x, h) {
	if (x >= 0 && x < this.pw) {
		this.pc.fillStyle = this.color(h);
		this.pc.fillRect(x, 0, 1, 1);
	}
};

SpecPlot.prototype.swap = function () {
	var pc = this.qc;
	this.qc = this.pc;
	this.pc = pc;
	
	var p = this.q;
	this.q = this.p;
	this.p = p;
};

SpecPlot.prototype.init = function (wmin, wmax, wstep, hmin, hmax) {
	base.init.call(this, wmin, wmax, !wstep, hmin, hmax, false);
	this.reset();
	this.ac.clearRect(0, 0, this.cw, this.ch);
	
	this.ac.save();
	this.ac.fillStyle = 'black';
	this.ac.fillRect(
		this.mx + this.px, this.my + this.py,
		this.pw, this.ph);
	this.ac.restore();
	
	this.oc.save();
	this.oc.clearRect(0, 0, this.pw, this.ph);
	this.oc.strokeStyle = 'white';
	
	new Range(wmin, wmax, wstep).forEach(function (w, i, self) {
		var x = Math.floor(this.x(w)) + 0.5;
		
		if (!self.edge) {
			this.oc.globalAlpha = self.major ? 0.3125 : 0.25;
			this.oc.beginPath();
			this.oc.moveTo(x, 0);
			this.oc.lineTo(x, this.ph);
			this.oc.stroke();
		}
		
		this.ac.beginPath();
		this.ac.moveTo(
			this.mx + this.px + x,
			this.my + this.py);
		this.ac.lineTo(
			this.mx + this.px + x,
			this.my + this.py - (self.major ? 6 : 4) - 1.0);
		this.ac.stroke();
	}, this);
	
	this.oc.restore();
	
	this.ac.beginPath();
	this.ac.moveTo(
		this.mx + this.px,
		this.my + this.py - 0.5);
	this.ac.lineTo(
		this.mx + this.px + this.pw,
		this.my + this.py - 0.5);
	this.ac.stroke();
};

SpecPlot.prototype.draw = function (series, f0, formants) {
	base.draw.call(this);
	this.pc.clearRect(0, 0, this.pw, this.ph);
	this.pc.save();
	this.pc.imageSmoothingEnabled = false;
	this.pc.drawImage(this.q, 0, 1);
	this.pc.restore();
	
	var lx;
	var mh, s;
	var i = 0;
	for (; i < series.length; i++) {
		s = series.getW(i);
		if (!this.wlog || s > 0) {
			lx = Math.floor(this.x(s));
			mh = series.getH(i);
			i++;
			break;
		}
	}
	
	this.pc.save();
	for (; i < series.length; i++) {
		var x = Math.floor(this.x(series.getW(i)));
		s = series.getH(i);
		if (x == lx) {
			if (s > mh) {
				mh = s;
			}
		} else {
			this.point(lx, mh);
			var dx = x - lx;
			var lh = series.getH(i - 1);
			var slope = (s - lh) / dx;
			for (var j = 1; j < dx; j++) {
				this.point(lx + j, lh + slope * j);
			}
			lx = x;
			mh = s;
		}
	}
	this.point(lx, mh);
	this.pc.restore();
	
	this.drawHighlights(f0, formants);
	this.c.drawImage(this.p, this.mx + this.px, this.my + this.py);
	this.drawOverlay();
	this.swap();
};

SpecPlot.prototype.drawHighlights = function (f0, formants) {
	this.pc.save();
	if (f0 != null) {
		this.pc.fillStyle = COLOR.F0;
		this.pc.fillRect(this.x(f0) - 1.0, 0, 2, 1);
	}
	this.pc.fillStyle = COLOR.FORMANT;
	for (var i = 0; i < formants.length; i++) {
		if (i == 4) {
			this.pc.fillStyle = COLOR.SUB;
		}
		this.pc.fillRect(this.x(formants[i]) - 1.0, 0, 2, 1);
	}
	this.pc.restore();
};

SpecPlot.prototype.drawOverlay = function () {
	this.c.save();
	this.c.globalCompositeOperation = 'lighter';
	this.c.drawImage(this.o, this.mx + this.px, this.my + this.py);
	this.c.restore();
};


function FPlot(canvas) {
	Base.call(this, canvas, 16, 12, 36, 29);
	
	this.q = document.createElement('canvas');
	this.q.width = this.pw;
	this.q.height = this.ph;
	this.qc = this.q.getContext('2d');
	
	this.qc.save();
	this.qc.fillStyle = 'black';
	this.qc.fillRect(0, 0, this.pw, this.ph);
	this.qc.restore();
	
	var wmin =    0, wmax = 1200;
	var hmin = 1000, hmax = 3000;
	this.wrange = new Range(wmin, wmax, 200);
	this.hrange = new Range(hmin, hmax, 200);
	
	base.init.call(this, wmin, wmax, false, hmin, hmax, true);
	this.xm = 1; this.ym = 1;
}
FPlot.prototype = new Prototype();

FPlot.prototype.init = function () {
	this.reset();
	this.ac.clearRect(0, 0, this.cw, this.ch);
	this.ac.save();
	
	this.ac.textAlign = 'center';
	this.ac.textBaseline = 'top';
	this.wrange.forEach(function (w, i, self) {
		var x = this.x(w);
		this.ac.beginPath();
		this.ac.moveTo(
			this.mx + this.px + x,
			this.my + this.ph);
		this.ac.lineTo(
			this.mx + this.px + x,
			this.my + this.ph + (self.major ? 6 : 4) + 1.0);
		this.ac.stroke();
		
		this.ac.fillText((w / 1000.0).toFixed(1),
			this.mx + this.px + x,
			this.my + this.ph + 8);
	}, this);
	
	this.ac.textAlign = 'right';
	this.ac.textBaseline = 'middle';
	this.hrange.forEach(function (h, i, self) {
		var y = this.y(h);
		this.ac.beginPath();
		this.ac.moveTo(
			this.mx + this.px,
			this.my + y);
		this.ac.lineTo(
			this.mx + this.px - (self.major ? 6 : 4) - 1.0,
			this.my + y);
		this.ac.stroke();
		
		if (self.major) {
			this.ac.fillText((h / 1000.0).toFixed(1),
				this.mx + this.px - 10,
				this.my + y);
		}
	}, this);
	
	this.ac.textAlign = 'center';
	this.ac.textBaseline = 'top';
	this.ac.fillText('F1 [kHz]',
		this.mx + this.px + this.pw / 2,
		this.my + this.ph + 22);
	
	this.ac.textBaseline = 'bottom';
	this.ac.rotate(-Math.PI / 2.0);
	this.ac.fillText('F2 [kHz]',
		-(this.my + this.ph / 2),
		this.mx + this.px - 32);
	
	this.ac.restore();
	
	this.ac.beginPath();
	this.ac.moveTo(
		this.mx + this.px - 0.5,
		this.my - 0.5);
	this.ac.lineTo(
		this.mx + this.px + this.pw + 0.5,
		this.my - 0.5);
	this.ac.lineTo(
		this.mx + this.px + this.pw + 0.5,
		this.my + this.ph + 0.5);
	this.ac.lineTo(
		this.mx + this.px - 0.5,
		this.my + this.ph + 0.5);
	this.ac.closePath();
	this.ac.stroke();
};

FPlot.prototype.draw = function (formants) {
	base.draw.call(this);
	
	var x, y, x2, y2;
	if (0 < formants.length) {
		x = this.x(formants[0]);
	}
	if (1 < formants.length) {
		y = this.y(formants[1]);
	}
	
	this.qc.save();
	this.qc.fillStyle = 'rgba(0, 0, 0, 0.125)';
	this.qc.fillRect(0, 0, this.pw, this.ph);
	
	if (2 < formants.length) {
		x2 = this.x(formants[1]);
		y2 = this.y(formants[2]);
		this.qc.fillStyle = COLOR.SUB;
		this.qc.beginPath();
		this.qc.arc(x2, y2, 2, 0.0, Math.PI * 2.0);
		this.qc.fill();
	}
	if (1 < formants.length) {
		x2 = x < 0 ? 1 : x > this.pw ? this.pw - 1 : x;
		y2 = y < 0 ? 1 : y > this.ph ? this.ph - 1 : y;
		this.qc.fillStyle = COLOR.FORMANT;
		if (x2 != x || y2 != y) {
			this.qc.fillRect(x2 - 2, y2 - 2, 4, 4);
		} else {
			this.qc.beginPath();
			this.qc.arc(x, y, 2, 0.0, Math.PI * 2.0);
			this.qc.fill();
		}
	}
	this.qc.restore();
	
	this.pc.save();
	this.pc.fillStyle = COLOR.BACKGROUND;
	this.pc.fillRect(0, 0, this.pw, this.ph);
	this.pc.globalCompositeOperation = 'lighten';
	this.pc.drawImage(this.q, 0, 0);
	this.pc.restore();
	
	this.pc.save();
	this.pc.setLineDash([4]);
	this.pc.strokeStyle = COLOR.FORMANT;
	if (0 < formants.length) {
		this.pc.beginPath();
		this.pc.moveTo(x, this.ph);
		this.pc.lineTo(x, 0);
		this.pc.stroke();
	}
	if (1 < formants.length) {
		this.pc.beginPath();
		this.pc.moveTo(0, y);
		this.pc.lineTo(this.pw, y);
		this.pc.stroke();
	}
	this.pc.restore();
	
	this.c.drawImage(this.p, this.mx + this.px, this.my);
};


function SPlot(canvas) {
	Base.call(this, canvas, 16, 12, 36, 29);
	
	base.init.call(this, 0, 1, false, -4, +4, false);
	this.ym = 1;
}
SPlot.prototype = new Prototype();

SPlot.prototype.init = function (order) {
	this.wmax = order + 1;
	this.reset();
	this.ac.clearRect(0, 0, this.cw, this.ch);
	
	var y = this.y(0);
	
	this.ac.save();
	this.ac.setLineDash([2]);
	this.ac.strokeStyle = COLOR.SUB;
	this.ac.beginPath();
	this.ac.moveTo(
		this.mx + this.pw,
		this.my + y);
	this.ac.lineTo(
		this.mx,
		this.my + y);
	this.ac.stroke();
	this.ac.restore();
	
	this.ac.save();
	this.ac.textAlign = 'left';
	this.ac.textBaseline = 'middle';
	for (var i = this.hmin; i <= this.hmax; i++) {
		y = this.y(i);
		this.ac.beginPath();
		this.ac.moveTo(
			this.mx + this.pw,
			this.my + y);
		this.ac.lineTo(
			this.mx + this.pw + (i % 2 == 0 ? 6 : 4) + 1.0,
			this.my + y);
		this.ac.stroke();
		
		if (i % 2 == 0) {
			this.ac.fillText((i > 0 ? '+' : '') + i / 2,
				this.mx + this.pw + 10,
				this.my + y);
		}
	}
	this.ac.textAlign = 'center';
	this.ac.textBaseline = 'top';
	this.ac.rotate(-Math.PI / 2.0);
	this.ac.fillText('Section radius',
		-(this.my + this.ph / 2),
		this.mx + this.pw + 32);
	this.ac.restore();
	
	this.ac.beginPath();
	this.ac.moveTo(
		this.mx,
		this.my - 0.5);
	this.ac.lineTo(
		this.mx + this.pw + 0.5,
		this.my - 0.5);
	this.ac.lineTo(
		this.mx + this.pw + 0.5,
		this.my + this.ph + 0.5);
	this.ac.lineTo(
		this.mx,
		this.my + this.ph + 0.5);
	this.ac.stroke();
};

SPlot.prototype.draw = function (sqrtS) {
	base.draw.call(this);
	this.pc.clearRect(0, 0, this.pw, this.ph);
	
	if (sqrtS != null) {
		for (var f = 1; f == 1 || f == -1; f -= 2) {
			this.pc.beginPath();
			var x = this.x(sqrtS.length + 1);
			var y = this.y(f);
			this.pc.moveTo(x, y);
			x = this.x(sqrtS.length);
			this.pc.lineTo(x, y);
			for (var i = sqrtS.length - 1; i >= 0; i--) {
				y = this.y(Math.min(5, sqrtS[i]) * f);
				this.pc.lineTo(x, y);
				x = this.x(i);
				this.pc.lineTo(x, y);
			}
			this.pc.stroke();
		}
	}
	
	this.c.drawImage(this.p, this.mx, this.my);
};

return {
	FFTPlot: FFTPlot, SpecPlot: SpecPlot,
	FPlot: FPlot, SPlot: SPlot
};

})();
