var main = (function () {
'use strict';

var EQ = (function (eq, frequency, length) {
	var f = frequency;
	for (var i = length - 1; i >= 0; i--) {
		eq[i] = f;
		f /= 2;
	}
	return eq;
})([], 16000, 10);

function formatInt(digits, number) {
	return number < 0 ? '-' + formatInt(digits, -number) :
		(9999999999 - ~number + '').slice(-digits);
}

function getPrefixed(object, key) {
	var re = new RegExp('^[a-z]+' + key + '$');
	var k;
	for (k in object) {
		if (re.test(k)) {
			return object[k];
		}
	}
	var names = Object.getOwnPropertyNames(object);
	for (var i = 0; i < names.length; i++) {
		k = names[i];
		if (re.test(k)) {
			return object[k];
		}
	}
}
function getAudioContext() {
	if (typeof AudioContext != 'undefined') {
		return AudioContext;
	}
	return getPrefixed(window, 'AudioContext');
}
function getGetUserMedia() {
	var getUserMedia = 'getUserMedia' in navigator ?
		navigator.getUserMedia :
		getPrefixed(navigator, 'GetUserMedia');
	return function (constraints) {
		return new Promise(function (resolve, reject) {
			getUserMedia.call(navigator,
				constraints, resolve, reject);
		});
	};
}

function FFTOption(sampleRate, sampleSize, smoothing, eq) {
	this.sampleRate = sampleRate;
	this.sampleSize = sampleSize;
	this.smoothing =
		smoothing < 0.0 ? 0.0 :
		smoothing > 1.0 ? 1.0 : smoothing;
	this.eq = eq;
}

function FFT(audioContext) {
	this.context = audioContext;
	this.contextSampleRate = audioContext.sampleRate;
	this.analyser = audioContext.createAnalyser();
	
	this.filters = null;
	this.destination = null;
	
	this.sampleRate = 0;
	this.sampleSize = 0;
	this.array = null;
}

FFT.prototype.createFilters = function () {
	var filter = this.context.createBiquadFilter();
	filter.type = 'lowshelf';
	filter.frequency.value = EQ[0] * Math.SQRT2;
	
	var filters = [filter];
	var i;
	for (i = 1; i < EQ.length - 1; i++) {
		if (EQ[i + 1] * 2 > this.contextSampleRate) break;
		
		filter = this.context.createBiquadFilter();
		filter.type = 'peaking';
		filter.frequency.value = EQ[i];
		
		filters[i - 1].connect(filter);
		filters[i] = filter;
	}
	
	filter = this.context.createBiquadFilter();
	filter.type = 'highshelf';
	filter.frequency.value = EQ[i] * Math.SQRT1_2;
	
	filters[i - 1].connect(filter);
	filters[i] = filter;
	
	filter.connect(this.analyser);
	return filters;
};

FFT.prototype.setEq = function (value) {
	for (var i = 0; i < this.filters.length; i++) {
		this.filters[i].gain.value = value[i];
	}
};

FFT.prototype.init = function (option) {
	if (option.eq == null) {
		this.destination = this.analyser;
	} else {
		if (this.filters == null) {
			this.filters = this.createFilters();
		}
		this.setEq(option.eq);
		this.destination = this.filters[0];
	}
	
	var n = Math.pow(2, Math.floor(Math.log2(
		this.contextSampleRate / option.sampleRate)));
	var ratio = n < 1 ? 1 : n;
	this.sampleRate = this.contextSampleRate / ratio;
	
	var fftSize = option.sampleSize * n;
	try {
		this.analyser.fftSize = fftSize;
	} catch (e) {
		fftSize = this.analyser.fftSize;
	}
	this.sampleSize = fftSize / ratio;
	
	this.analyser.smoothingTimeConstant = option.smoothing;
	
	var length = this.sampleSize / 2;
	if (this.array == null || this.array.length != length) {
		this.array = new Float32Array(length);
	}
};

function Context() {
	var self = this;
	this.AudioContext = getAudioContext();
	this.getUserMedia =
		'mediaDevices' in navigator &&
		'getUserMedia' in navigator.mediaDevices ?
			null : getGetUserMedia();
	this.settingsInTrack = 'getSettings' in MediaStreamTrack.prototype;
	
	this.ffts = {};
	this.fftOption = null;
	
	this.stream = null;
	this.source = null;
	this.fft = null;
	
	this.__start = function (stream) {
		return self._start(stream);
	};
}

Context.prototype.createFFT = function (sampleRate) {
	if (sampleRate in this.ffts) {
		return this.ffts[sampleRate];
	}
	var audioContext;
	var fft;
	if (sampleRate == 0) {
		audioContext = new this.AudioContext();
		fft = new FFT(audioContext);
		this.ffts[fft.contextSampleRate] = fft;
	} else {
		try {
			audioContext = new this.AudioContext({
				sampleRate: sampleRate
			});
		} catch (e) {
			fft = this.createFFT(0);
		}
		if (fft == null) {
			fft = new FFT(audioContext);
		}
	}
	this.ffts[sampleRate] = fft;
	return fft;
};

Context.prototype.start = function (constraints) {
	var audio = { audio: constraints };
	if (this.getUserMedia != null) {
		return this.getUserMedia(audio).then(this.__start);
	}
	return navigator.mediaDevices.getUserMedia(audio).then(this.__start);
};
Context.prototype._start = function (stream) {
	var fft = this.createFFT(this.fftOption.sampleRate);
	var source;
	try {
		source = fft.context.createMediaStreamSource(stream);
	} catch (e) {
		var sampleRate = 0;
		if (this.settingsInTrack) {
			var tracks = stream.getAudioTracks();
			if (tracks.length > 0) {
				var settings = tracks[0].getSettings();
				if ('sampleRate' in settings) {
					sampleRate = settings['sampleRate'];
				}
			}
		}
		fft = this.createFFT(sampleRate);
		source = fft.context.createMediaStreamSource(stream);
	}
	fft.init(this.fftOption);
	source.connect(fft.destination);
	
	this.stream = stream;
	this.source = source;
	this.fft = fft;
	return fft;
};

Context.prototype.startAudio = function (element) {
	var fft = this.createFFT(this.fftOption.sampleRate);
	var source = fft.context.createMediaElementSource(element);
	fft.init(this.fftOption);
	fft.analyser.connect(fft.context.destination);
	source.connect(fft.destination);
	
	this.source = source;
	this.fft = fft;
	return fft;
};

Context.prototype.stop = function () {
	this.source.disconnect();
	this.source = null;
	if (this.stream != null) {
		var tracks = this.stream.getTracks();
		for (var i = 0; i < tracks.length; i++) {
			tracks[i].stop();
		}
		this.stream = null;
	}
	this.fft.analyser.disconnect();
	this.fft = null;
};

Context.prototype.getFFT = function () {
	this.fft.analyser.getFloatFrequencyData(this.fft.array);
	return this.fft;
};

function Recorder(stream) {
	var self = this;
	var chunks = [];
	
	this.mediaRecorder = new MediaRecorder(stream);
	this.date = null;
	this.recording = false;
	
	this.type = null;
	this.blob = null;
	
	this.onstart = null;
	this.onerror = null;
	this.callback = null;
	
	this.mediaRecorder.onstart = function () {
		self.date = new Date();
		self.recording = true;
		self.onstart(self.date);
	};
	this.mediaRecorder.onerror = function (event) {
		self.onerror(event.error);
	};
	this.mediaRecorder.ondataavailable = function (event) {
		if (!self.type) {
			self.type = event.data.type;
		}
		chunks.push(event.data);
	};
	this.mediaRecorder.onstop = function () {
		self.recording = false;
		try {
			self.blob = new Blob(chunks, { type: self.type });
		} finally {
			chunks = null;
			if (self.callback != null) {
				self.callback(self.blob);
			}
		}
	};
}

Recorder.prototype.start = function (onstart, onerror) {
	this.onstart = onstart;
	this.onerror = onerror;
	this.mediaRecorder.start();
};
Recorder.prototype.stop = function (callback) {
	var self = this;
	this.callback = callback;
	if (this.recording) {
		try {
			this.mediaRecorder.stop();
		} catch (e) { }
	} else {
		window.setTimeout(function () {
			self.callback(self.blob);
		});
	}
};

Recorder.prototype.getName = function () {
	return '録音 - ' + (
		formatInt(4, this.date.getFullYear()) +
		formatInt(2, this.date.getMonth() + 1) +
		formatInt(2, this.date.getDate()) + 'T' +
		formatInt(2, this.date.getHours()) +
		formatInt(2, this.date.getMinutes()) +
		formatInt(2, this.date.getSeconds()));
};
Recorder.prototype.getExt = function () {
	if (this.type) {
		if (/^audio\/ogg(?=\W|$)/i.test(this.type)) {
			return '.ogg';
		}
	}
	return '';
};

function Interval(callback) {
	var self = this;
	this.callback = callback;
	
	this.rate = 0.0;
	this.i = 0;
	this.j = 0;
	
	this.interrupted = false;
	this.resume = false;
	this.active = false;
	this.h = null;
	this.id = null;
	
	this.__callback = function () {
		self._callback();
	};
	this.__count = function () {
		self._count();
	};
}

Interval.prototype.set = function () {
	if (this.interrupted) {
		this.resume = true;
	} else if (!this.active) {
		this.active = true;
		this.h = window.requestAnimationFrame(this.__callback);
		this.id = window.setInterval(this.__count, 200);
	}
};
Interval.prototype.clear = function () {
	if (this.interrupted) {
		this.resume = false;
	} else if (this.active) {
		this.rate = 0.0;
		this.i = 0;
		this.j = 0;
		window.clearInterval(this.id);
		window.cancelAnimationFrame(this.h);
		this.active = false;
	}
};

Interval.prototype.interrupt = function (callback) {
	var self = this;
	if (!this.interrupted) {
		this.resume = this.active;
		this.clear();
		this.interrupted = true;
		window.setTimeout(function () {
			callback();
			self.interrupted = false;
			if (self.resume) {
				self.set();
			}
		});
	}
};

Interval.prototype._count = function () {
	this.j++;
	if (this.rate == 0.0 ? this.i != 0 : ~(this.rate * this.i) != ~0) {
		// 30.0 fps * (interval / 1000)
		this.rate = 6 * this.j / this.i;
		this.i = 0;
		this.j = 0;
	}
};
Interval.prototype._callback = function () {
	this.h = window.requestAnimationFrame(this.__callback);
	var t = this.rate * this.i++;
	if (~(this.rate * this.i) != ~t) {
		this.callback();
	}
};

var seek = (function () {
	function durationchange() {
		this.removeEventListener('durationchange', durationchange);
		this.currentTime = 0;
		this.controls = true;
	}
	function canplay() {
		this.removeEventListener('canplay', canplay);
		this.removeEventListener('loadedmetadata', canplay);
		if (!this.controls) {
			if (this.duration != Infinity) {
				this.controls = true;
				return;
			}
			this.addEventListener('durationchange', durationchange);
			this.currentTime = 0xffffffff;
		}
	}
	function error() {
		this.controls = true;
		throw this.error;
	}
	return function (media) {
		media.addEventListener('error', error);
		media.addEventListener('canplay', canplay);
		media.addEventListener('loadedmetadata', canplay);
		return media;
	};
})();

function getValues(elements) {
	var values = {};
	for (var i = 0; i < elements.length; i++) {
		var element = elements[i];
		if (!element.name) continue;
		switch (element.tagName) {
			case 'SELECT':
			values[element.name] = element.selectedIndex;
			continue;
			case 'INPUT':
			switch (element.type) {
				case 'button':
				case 'file':
				continue;
				case 'checkbox':
				values[element.name] = element.checked;
				continue;
				case 'radio':
				if (element.checked) {
					values[element.name] = element.value;
				}
				continue;
			}
			break;
		}
		values[element.name] = element.value;
	}
	return values;
}

function setChecked(list, value) {
	for (var i = 0; i < list.length; i++) {
		var radio = list[i];
		if (radio.value == value) {
			radio.checked = true;
			break;
		}
	}
}
function setValues(elements, values) {
	for (var name in values) {
		if (name in elements) {
			var element = elements[name];
			var value = values[name];
			switch (typeof value) {
				case 'number':
				element.selectedIndex = value;
				break;
				case 'boolean':
				element.checked = value;
				break;
				default:
				if ('length' in element) {
					setChecked(element, value);
				} else {
					element.value = value;
				}
				break;
			}
		}
	}
}

return {
	EQ: EQ, formatInt: formatInt,
	FFTOption: FFTOption, Context: Context,
	Recorder: Recorder,
	Interval: Interval,
	seek: seek,
	getValues: getValues, setValues: setValues
};

})();
