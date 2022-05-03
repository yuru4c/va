(function () {
'use strict';

var SAVE = 'va-form';
var CAPTURE = '\0';
var CONSTRAINTS = {
	'autoGainControl': false,
	'echoCancellation': false,
	'noiseSuppression': false
};

var calcWidth = (function () {
	var MARGIN = 8 + 8;
	var PORTRAIT = MARGIN + 600;
	var WIDTH = PORTRAIT + 300 + 30;
	var HEIGHT = MARGIN + 450 - 30;
	return function () {
		var w = window.outerWidth;
		var h = window.outerHeight;
		if (h < HEIGHT) {
			var r = HEIGHT * w / h;
			if (r > WIDTH) {
				return 'width=' + r;
			}
		}
		if (w > h) {
			if (w < WIDTH) {
				return 'width=' + WIDTH;
			}
		} else {
			if (w < PORTRAIT) {
				return 'width=' + PORTRAIT;
			}
		}
		return 'width=device-width';
	};
})();

function getChecked(list) {
	for (var i = 0; i < list.length; i++) {
		var radio = list[i];
		if (radio.checked) {
			return radio.value;
		}
	}
	return '';
}
function setSelected(select, value) {
	var options = select.options;
	for (var i = 0; i < options.length; i++) {
		if (options[i].value == value) {
			select.selectedIndex = i;
			break;
		}
	}
}
function setDisabled(elements, disabled) {
	for (var i = 0; i < elements.length; i++) {
		elements[i].disabled = disabled;
	}
}
function setOninput(list, listener) {
	function oninput(event) {
		this.removeEventListener('change', listener);
		this.removeEventListener('input', oninput);
		this.addEventListener('input', listener);
		listener.call(this, event);
	}
	for (var i = 0; i < list.length; i++) {
		var element = list[i];
		element.addEventListener('change', listener);
		element.addEventListener('input', oninput);
	}
}

function Content(fft) {
	this.sampleRate = fft.sampleRate;
	this.sampleSize = fft.sampleSize;
	this.array = fft.array;
	this.f = new va.Series(this.array, this.sampleRate);
}

function Plot(elements, canvas) {
	this.nyquist = elements['fft-rate'].value / 2;
	this.fs = +elements['option-fs'].value;
	this.log = elements['log'].checked;
	this.order = +elements['order'].value;
	this.detect = +getChecked(elements['detect']);
	
	this.min = 0;
	this.max = 0;
	
	this.fft = new plot.FFTPlot(canvas.fft);
	this.spc = new plot.SpecPlot(canvas.spc);
	this.f = new plot.FPlot(canvas.f);
	this.s = new plot.SPlot(canvas.s);
	
	this.content = null;
}

Plot.prototype.init = function () {
	var min = 0, step = 0;
	if (this.log) {
		min = this.nyquist < 10000 ? this.nyquist / 100 : 100;
	} else {
		step = 500;
		for (var i = 8000; i <= this.nyquist; i *= 2) {
			step *= 2;
		}
	}
	this.fft.init(min, this.nyquist, step, this.min, this.max);
	this.spc.init(min, this.nyquist, step, this.min, this.max);
	this.f.init();
	this.s.init(this.order);
	
	if (this.content == null) {
		this.fft.draw([], null, []);
		this.spc.draw([], null, []);
		this.f.draw([]);
		this.s.draw(null);
	} else {
		this.draw(this.content);
	}
};

Plot.prototype.draw = function (content) {
	var fs = this.fs < content.sampleRate ?
		this.fs : content.sampleRate;
	var n = content.sampleRate / fs * 2;
	
	var cor = va.autocor(content.array, content.sampleSize / n);
	var f0 = va.fundamental(cor, fs);
	
	var p = va.parcor(cor, this.order);
	var r = p.residue * n / content.sampleSize;
	var freq = va.freqz(r, p.alpha, fs);
	
	var formants;
	switch (this.detect) {
		default:
		case 0:
		formants = va.formants(p.alpha, fs, freq);
		break;
		case 1:
		formants = va.peaks(freq);
		break;
	}
	
	this.fft.draw([freq, content.f], f0, formants);
	this.spc.draw(content.f, f0, formants);
	this.f.draw(formants);
	this.s.draw(p.sqrtS);
	
	this.content = content;
};

function Text(select) {
	this.select = select;
	this.parent = select.parentNode;
	this.input = document.createElement('input');
	this.input.className = 'text';
}

Text.prototype.setWidth = function () {
	var hidden = this.select.hidden;
	this.select.hidden = false;
	var width = this.select.offsetWidth;
	this.select.hidden = hidden;
	
	if (width == 0) {
		return null;
	}
	return this.input.style.width = width + 'px';
};

Text.prototype.insert = function (value) {
	this.input.value = value;
	this.select.hidden = true;
	if (this.input.parentNode == null) {
		this.parent.insertBefore(this.input, this.select);
	}
};
Text.prototype.remove = function () {
	if (this.input.parentNode == this.parent) {
		this.parent.removeChild(this.input);
	}
	this.select.hidden = false;
};

function Timer(text, date) {
	this.text = text;
	this.time = date.getTime();
	this.duration = null;
}
Timer.prototype.write = function (now) {
	var t = (now - this.time) * 0.001 >> 0;
	if (t != this.duration) {
		var s = t % 60, m = (t - s) / 60;
		this.text.data = '録音中 ' + (m + ':' + main.formatInt(2, s));
		this.duration = t;
	}
};

function GraphicEq(element, callback) {
	var self = this;
	this.callback = callback;
	this.group = null;
	
	this.v = [];
	this.v.length = main.EQ.length;
	this.value = [];
	this.value.length = main.EQ.length;
	
	this.inputs = [];
	this.inputs.length = main.EQ.length;
	function oninput() {
		self.oninput(this);
	}
	
	for (var i = 0; i < main.EQ.length; i++) {
		var frequency = main.EQ[i];
		var str = frequency < 1000 ?
			(frequency >> 0) + '' :
			(frequency / 1000 >> 0) + 'k';
		
		var input = document.createElement('input');
		input.type = 'range';
		input.name = 'eq[' + i + ']';
		input.min = '-15';
		input.max = '15';
		input.defaultValue = '0';
		input.setAttribute('orient', 'vertical');
		input.addEventListener('input', oninput);
		this.inputs[i] = input;
		
		var span = document.createElement('span');
		span.className = 'eq-slider';
		span.appendChild(input);
		
		var label = document.createElement('label');
		label.appendChild(span);
		label.appendChild(document.createTextNode(str));
		element.appendChild(label);
	}
}

GraphicEq.prototype.init = function () {
	for (var i = 0; i < main.EQ.length; i++) {
		var input = this.inputs[i];
		var value = input.value;
		input.title = value;
		this.v[i] = this.value[i] = +value;
	}
};

GraphicEq.prototype.d = function (i) {
	switch (this.group) {
		default:
		case 0:
		return 0.0;
		case 1:
		return Math.exp(-Math.abs(i));
		case 2:
		var s = i * i * 0.5;
		return (s < 1.0 ? 2.0 + 1.0 / (s - 2.0) : 1.0 / s) / 1.5;
	}
};
GraphicEq.prototype.oninput = function (self) {
	for (var i = 0; i < this.inputs.length; i++) {
		if (this.inputs[i] != self) continue;
		
		var str = self.value;
		var vi = +str;
		self.title = str;
		this.v[i] = this.value[i] = vi;
		
		for (var j = 0; j < this.v.length; j++) {
			if (j == i) continue;
			
			var vj = this.v[j];
			vj += (vi - vj) * this.d(i - j);
			this.v[j] = vj;
			
			var value = Math.round(vj);
			this.value[j] = value;
			
			var input = this.inputs[j];
			input.value = value;
			input.title = input.value;
		}
		break;
	}
	this.callback(this.value);
};

GraphicEq.prototype.reset = function () {
	for (var i = 0; i < main.EQ.length; i++) {
		this.v[i] = this.value[i] = 0;
		var input = this.inputs[i];
		input.value = '0';
		input.title = input.value;
	}
	this.callback(this.value);
};

function Constraints(fieldset) {
	var self = this;
	this.fieldset = fieldset;
	
	this.select = fieldset.form.elements['constraints-device'];
	this.text = new Text(this.select);
	this.checks = {};
	
	this.deviceId = this.select.value;
	setOninput([this.select], function () {
		self.deviceId = this.value;
	});
	
	this.constraints = null;
	this.disabled = false;
	this.once = false;
	
	this.display = false;
	this.__enumerate = function (devices) {
		self._enumerate(devices);
	};
	
	if ('mediaDevices' in navigator) {
		if ('getSupportedConstraints' in navigator.mediaDevices) {
			this.initChecks();
		}
		if ('getDisplayMedia' in navigator.mediaDevices) {
			this.display = true;
		}
		if ('enumerateDevices' in navigator.mediaDevices) {
			this.enumerate();
			navigator.mediaDevices
			.addEventListener('devicechange', function () {
				self.enumerate();
			});
			this.once = true;
		}
	}
	if (!this.once) {
		this._enumerate([]);
	}
}

Constraints.prototype.initChecks = function () {
	var c = navigator.mediaDevices.getSupportedConstraints();
	for (var k in CONSTRAINTS) {
		if (k in c) {
			var input = document.createElement('input');
			input.type = 'checkbox';
			input.name = 'constraints["' + k + '"]';
			input.checked = CONSTRAINTS[k];
			this.checks[k] = input;
			
			var label = document.createElement('label');
			label.appendChild(input);
			label.appendChild(document.createTextNode(' ' + k));
			this.fieldset.appendChild(label);
		}
	}
};

Constraints.prototype.enumerate = function () {
	navigator.mediaDevices.enumerateDevices().then(this.__enumerate);
};
Constraints.prototype._enumerate = function (devices) {
	this.select.innerHTML = '';
	for (var i = 0; i < devices.length; i++) {
		var info = devices[i];
		if (info.kind == 'audioinput') {
			this.select.add(new Option(
				info.label || info.deviceId || '(不明)',
				info.deviceId));
		}
	}
	if (this.select.length == 0) {
		this.select.add(new Option('(なし)', ''));
	}
	if (this.display) {
		this.select.add(new Option('(キャプチャ)', CAPTURE));
	}
	setSelected(this.select, this.deviceId);
	this.text.setWidth();
};

Constraints.prototype.get = function () {
	var audio = {};
	this.deviceId = this.select.value;
	if (this.deviceId && this.deviceId != CAPTURE) {
		audio['deviceId'] = this.deviceId;
	}
	for (var k in this.checks) {
		audio[k] = this.checks[k].checked;
	}
	
	var constraints = { audio: audio };
	if (this.deviceId == CAPTURE) {
		constraints['video'] = true;
	}
	this.constraints = constraints;
	return constraints;
};

Constraints.prototype.onStart = function (context) {
	if (this.once && this.deviceId != CAPTURE) {
		this.once = false;
		this.enumerate();
	}
	if (this.disabled) return;
	
	var tracks = context.stream.getAudioTracks();
	if (tracks.length > 0) {
		var track = tracks[0];
		var label = track.label;
		var settings;
		if (context.settingsInTrack) {
			settings = track.getSettings();
			if (!label && 'deviceId' in settings) {
				label = settings['deviceId'];
			}
		}
		
		this.text.insert(label || '(不明)');
		for (var k in this.checks) {
			var check = this.checks[k];
			if (context.settingsInTrack) {
				if (k in settings) {
					check.checked = settings[k];
				} else {
					check.indeterminate = true;
				}
			} else {
				check.style.visibility = 'hidden';
			}
		}
	}
	this.disabled = true;
};

Constraints.prototype.onStop = function () {
	if (this.disabled) {
		this.text.remove();
		var audio = this.constraints.audio;
		for (var k in this.checks) {
			var check = this.checks[k];
			check.indeterminate = false;
			check.checked = audio[k];
			check.style.visibility = '';
		}
		this.disabled = false;
	}
};

document.addEventListener('DOMContentLoaded', function () {
	var viewport = document.getElementById('viewport');
	viewport.setAttribute('content', calcWidth());
	window.addEventListener('resize', function () {
		viewport.setAttribute('content', calcWidth());
	});
	
	var form = document.forms['main'];
	form.addEventListener('submit', function (event) {
		event.preventDefault();
	});
	var elements = form.elements;
	
	var context;
	var plot;
	
	var recorder;
	var audio;
	var urlRecord, urlOpen;
	
	var fm = document.getElementById('fieldset-mode');
	var spanRecord = document.getElementById('span-record');
	var textRecord = spanRecord.firstChild;
	var anchor = document.createElement('a');
	var timer;
	
	var startMode;
	setOninput(elements['mode'], function () {
		startMode = +this.value;
		if (startMode != 2) {
			elements['open'].value = '';
		}
	});
	setOninput([elements['open']], function () {
		if (this.value) {
			startMode = 2;
			elements['mode'][2].checked = true;
		}
	});
	
	var eq = elements['eq-enabled'];
	var spanEq = document.getElementById('span-eq');
	var divEq = document.getElementById('div-eq');
	function eqOninput() {
		if (eq.checked) {
			spanEq.style.display = '';
			divEq.style.display = '';
		} else {
			spanEq.style.display = 'none';
			divEq.style.display = 'none';
		}
	}
	setOninput([eq], eqOninput);
	
	var divSliders = document.getElementById('div-sliders');
	var graphicEq = new GraphicEq(divSliders, function (value) {
		if (context != null && context.fft) {
			if (context.fftOption.eq != null) {
				context.fft.setEq(value);
			}
		}
	});
	elements['eq-reset'].addEventListener('click', function () {
		graphicEq.reset();
	});
	setOninput(elements['eq-group'], function () {
		graphicEq.group = +this.value;
	});
	
	var ff = document.getElementById('fieldset-fft');
	var textRate = new Text(elements['fft-rate']);
	var textSize = new Text(elements['fft-size']);
	function setWidth() {
		var width = textRate.setWidth();
		textSize.setWidth();
		if (width != null) {
			elements['fft-stc'].style.width = width;
		}
	}
	setWidth();
	
	setOninput([elements['option-fs']], function () {
		plot.fs = +this.value;
		plot.init();
	});
	
	var fc = document.getElementById('fieldset-constraints');
	var cs = new Constraints(fc);
	
	setOninput([elements['log']], function () {
		plot.log = this.checked;
		plot.init();
	});
	var textMin = document.getElementById('text-min').firstChild;
	var textMax = document.getElementById('text-max').firstChild;
	function rangeOninput() {
		if (this != elements['min']) {
			var max = +elements['max'].value;
			textMax.data = (max > 0 ? '+' : '') + max;
			elements['min'].min = 10 - max;
			plot.max = max;
		}
		if (this != elements['max']) {
			var min = -elements['min'].value;
			textMin.data = (min > 0 ? '+' : '') + min;
			elements['max'].min = min + 10;
			plot.min = min;
		}
		plot.init();
	}
	elements['min'].addEventListener('input', rangeOninput);
	elements['max'].addEventListener('input', rangeOninput);
	
	var pPlayer = document.getElementById('p-player');
	
	var interval = new main.Interval(function () {
		if (timer != null) {
			timer.write(Date.now());
		}
		if (context.fft) {
			if (audio == null || !audio.paused) {
				plot.draw(new Content(context.getFFT()));
			}
		}
	});
	
	var warned = {};
	function warn(message) {
		if (message in warned) return;
		interval.interrupt(function () {
			window.alert('警告: ' + message);
			warned[message] = true;
		});
	}
	
	function onStart(fft) {
		var option = context.fftOption;
		
		textRate.insert(fft.sampleRate);
		textSize.insert(fft.sampleSize);
		elements['fft-stc'].value = option.smoothing;
		
		var nyquist = fft.sampleRate / 2;
		if (nyquist != plot.nyquist) {
			plot.nyquist = nyquist;
			plot.init();
		}
		if (fft.sampleRate < option.sampleRate) {
			warn('サンプリング周波数 (' + fft.sampleRate + ' Hz)');
		}
	}
	
	function startAudio(self) {
		var files = elements['open'].files;
		if (files.length == 0) {
			if (urlRecord == null) {
				elements['open'].click();
				return;
			}
			urlOpen = urlRecord;
		} else {
			urlOpen = URL.createObjectURL(files[0]);
		}
		var temp = main.seek(document.createElement('audio'));
		temp.src = urlOpen;
		var fft = context.startAudio(temp);
		audio = temp;
		
		onStart(fft);
		interval.set();
		
		setDisabled([fm, eq, ff], true);
		pPlayer.appendChild(temp);
		self.value = '停止';
	}
	
	function startRecord() {
		textRecord.data = '開始中...';
		if (anchor.parentNode == spanRecord) {
			spanRecord.replaceChild(textRecord, anchor);
		}
		if (urlRecord != null) {
			URL.revokeObjectURL(urlRecord);
			urlRecord = null;
		}
		try {
			recorder = new main.Recorder(context.stream);
			recorder.start(function (date) {
				if (recorder == this) {
					timer = new Timer(textRecord, date);
				}
			}, function (error) {
				if (recorder == this) {
					timer = null;
					textRecord.data = error;
				}
			});
		} catch (e) {
			recorder = null;
			textRecord.data = e;
		}
	}
	
	function stopRecord(self) {
		timer = null;
		textRecord.data = '停止中...';
		self.disabled = true;
		
		recorder.stop(function (blob) {
			if (blob == null) {
				textRecord.data = '失敗';
			} else {
				var name = this.getName();
				var ext = this.getExt();
				urlRecord = URL.createObjectURL(blob);
				
				textRecord.data = name;
				anchor.href = urlRecord;
				anchor.download = name + ext;
				anchor.appendChild(textRecord);
				spanRecord.appendChild(anchor);
			}
			self.value = '再開';
			self.disabled = false;
			self.focus();
		});
	}
	
	function start(self) {
		context.fftOption = new main.FFTOption(
			+elements['fft-rate'].value,
			+elements['fft-size'].value,
			+elements['fft-stc'].value,
			eq.checked ? graphicEq.value : null);
		
		if (startMode == 2) {
			startAudio(self);
			return;
		}
		context.start(cs.get()).then(function (fft) {
			if (startMode == 1) {
				startRecord();
			}
			cs.onStart(context);
			onStart(fft);
			
			self.value = '停止';
			self.disabled = false;
			self.focus();
		}, function (reason) {
			interval.clear();
			
			setDisabled([fm, eq, ff, fc], false);
			window.alert(reason);
			self.disabled = false;
			self.focus();
		});
		interval.set();
		
		setDisabled([fm, eq, ff, fc, self], true);
	}
	
	function stop(self) {
		if (audio != null && !audio.controls) {
			audio.controls = true;
			return;
		}
		context.stop();
		interval.clear();
		
		cs.onStop();
		textRate.remove();
		textSize.remove();
		setDisabled([fm, eq, ff, fc], false);
		
		if (audio != null) {
			pPlayer.removeChild(audio);
			audio = null;
		}
		if (urlOpen != null) {
			if (urlOpen != urlRecord) {
				URL.revokeObjectURL(urlOpen);
			}
			urlOpen = null;
		}
		
		if (recorder != null) {
			stopRecord(self);
			recorder = null;
			return;
		}
		self.value = '再開';
	}
	
	elements['start'].addEventListener('click', function () {
		if (plot == null) return;
		try {
			if (context == null) {
				context = new main.Context();
			}
			if (context.fft) {
				stop(this);
			} else {
				start(this);
			}
		} catch (e) {
			window.alert(e);
		}
	});
	
	var textOrder = document.getElementById('text-order').firstChild;
	elements['order'].addEventListener('input', function () {
		var order = +this.value;
		textOrder.data = order;
		plot.order = order;
		plot.init();
	});
	setOninput(elements['detect'], function () {
		plot.detect = +this.value;
		plot.init();
	});
	
	document.getElementById('fieldsets')
	.addEventListener('toggle', function () {
		if (this.open) {
			setWidth();
			cs.text.setWidth();
		}
	});
	
	document.getElementById('container')
	.addEventListener('click', function () {
		window.scroll(0, this.offsetTop - 8);
	});
	var canvas = {
		fft: document.getElementById('canvas-fft'),
		spc: document.getElementById('canvas-spc'),
		f: document.getElementById('canvas-f'),
		s: document.getElementById('canvas-s')
	};
	
	elements['save'].addEventListener('click', function () {
		if (window.confirm('設定を保存しますか?')) {
			try {
				var values = main.getValues(elements);
				var json = JSON.stringify(values);
				window.localStorage.setItem(SAVE, json);
			} catch (e) {
				window.alert(e);
			}
		}
	});
	elements['delete'].addEventListener('click', function () {
		if (window.confirm('設定を削除しますか?')) {
			try {
				window.localStorage.removeItem(SAVE);
			} catch (e) {
				window.alert(e);
			}
		}
	});
	
	function load() {
		var values;
		try {
			var json = window.localStorage.getItem(SAVE);
			if (json == null) return;
			values = JSON.parse(json);
		} catch (e) {
			return;
		}
		main.setValues(elements, values);
	}
	
	window.addEventListener('pageshow', function () {
		load();
		plot = new Plot(elements, canvas);
		
		startMode = +getChecked(elements['mode']);
		
		eqOninput();
		graphicEq.group = +getChecked(elements['eq-group']);
		graphicEq.init();
		
		textOrder.data = plot.order;
		rangeOninput();
	});
});

})();
