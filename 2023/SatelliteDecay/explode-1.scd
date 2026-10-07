s.makeWindow.boot;




(
~xplode = Array.new;
~folder = PathName.new("C:/Users/secre/Documents/Space/SatelliteDecay/ExplosionSounds/Explosion");
~folder.entries;
(
~folder.entries.do({
	arg path;
	~xplode = ~xplode.add(Buffer.read(s,path.fullPath));
});
)
)

~xplode;

(
~xplode[0].play;
~xplode[1].play;
~xplode[2].play;
~xplode[3].play;
~xplode[4].play;
)


(
SynthDef.new(\boom,{
	arg amp = 1, out = [0,1], buff, loop = 0, rate = 1;
	var sig, env;
	sig = PlayBuf.ar(1, ~xplode[0,1,2,3,4].bufnum,loop:loop);
	//env = Env([1,0.5,0],[3,2,1]);
	sig =sig *amp;
	Out.ar([0,1], sig);
}).add;
)


Dust.kr(175)

{Blip.ar(Dust.kr(175), 40,1)}.play;



(
SynthDef.new(\decay,
	{
		arg x,y;
		var sig, env, rand;
		rand = Rand(x,y);
		env = Env.new([1,0.5,0],[5,1,5]);
		sig = Blip.ar(XLine.kr(rand,1,3),1,EnvGen.kr(env));
		Out.ar([0,1,2,3,4],sig);
}).add;
)

(
SynthDef(\sax, { |out, /*freq=440,*/ amp=0.08, gate=1, x, y|
	var rand = Rand(x,y) / 10;
	var freq = XLine.kr(rand,1,3);
	var num = 16;
	var harms = Array.series(num, 1, 1) * Array.exprand(num, 0.995, 1.001);
	var snd = SinOsc.ar(freq * SinOsc.kr(Rand(2.0,5.0),0,Rand(0.001, 0.01),1) * harms, mul:Array.geom(num, 1, 0.63));
	snd = Splay.ar(snd);
	snd = BBandPass.ar(snd, freq * XLine.kr(0.1,4,0.01), 2);
	snd = snd * amp * EnvGen.ar(Env.adsr(0.001, 0.2, 0.7, 0.2), gate, doneAction:2);

	Out.ar(out, snd!2);
}).add;
)

(
SynthDef(\organ, { |out, /*freq=440,*/ amp=0.05, gate=1, x, y|
	var rand = Rand(x,y) / 10;
	var freq = XLine.kr(rand,1,3);
    var snd;
    snd = Splay.ar(SinOsc.ar(freq*Array.geom(4,1,2), mul:1/4));
    snd = snd + SinOsc.ar(freq/2, mul:0.4)!2;
    snd = snd * EnvGen.ar(Env.asr(0.001,1,0.01), gate, doneAction:2);
    OffsetOut.ar(out, snd * amp);
}).add;
)

(
SynthDef("waveguideFlute", {
	arg scl = 0.2, /*freq = 440,*/ ipress = 0.9, ibreath = 0.09, ifeedbk1 = 0.4, ifeedbk2 = 0.4, decay = 1, gate = 1, amp = 0.6, x, y;

	var kenv1, kenv2, kenvibr, kvibr, sr, cr, block;
	var poly, signalOut, ifqc;
	var aflow1, asum1, asum2, afqc, atemp1, ax, apoly, asum3, avalue, atemp2, aflute1;
	var fdbckArray;
	var rand = Rand(x,y) / 3;
	var freq = XLine.kr(rand,1,3);

	var dur = decay;

	sr = SampleRate.ir;
	cr = ControlRate.ir;
	block = cr.reciprocal;

	ifqc = freq;

	// noise envelope
	kenv1 = EnvGen.kr(Env.new(
		[ 0.0, 1.1 * ipress, ipress, ipress, 0.0 ], [ 0.06, 0.2, dur - 0.46, 0.2 ], 'linear' )
	);
	// overall envelope
	kenv2 = EnvGen.kr(Env.new(
		[ 0.0, amp, amp, 0.0 ], [ 0.1, dur - 0.02, 0.1 ], 'linear' ), doneAction: 2
	);
	// vibrato envelope
	kenvibr = EnvGen.kr(Env.new( [ 0.0, 0.0, 1, 1, 0.0 ], [ 0.5, 0.5, dur - 1.5, 0.5 ], 'linear') );

	// create air flow and vibrato
	aflow1 = LFClipNoise.ar( sr, kenv1 );
	kvibr = SinOsc.ar( 5, 0, 0.1 * kenvibr );

	asum1 = ( ibreath * aflow1 ) + kenv1 + kvibr;
	afqc = ifqc.reciprocal - ( asum1/20000 ) - ( 9/sr ) + ( ifqc/12000000 ) - block;

	fdbckArray = LocalIn.ar( 1 );

	aflute1 = fdbckArray;
	asum2 = asum1 + ( aflute1 * ifeedbk1 );

	//ax = DelayL.ar( asum2, ifqc.reciprocal * 0.5, afqc * 0.5 );
	ax = DelayC.ar( asum2, ifqc.reciprocal - block * 0.5, afqc * 0.5 - ( asum1/ifqc/cr ) + 0.001 );

	apoly = ax - ( ax.cubed );
	asum3 = apoly + ( aflute1 * ifeedbk2 );
	avalue = LPF.ar( asum3, 2000 );

	aflute1 = DelayC.ar( avalue, ifqc.reciprocal - block, afqc );

	fdbckArray = [ aflute1 ];

	LocalOut.ar( fdbckArray );

	signalOut = avalue;

	OffsetOut.ar( 0, [ signalOut * kenv2, signalOut * kenv2 ] );

}).add;
)

(
SynthDef("harpsichord1", {
	arg out = 0, /*freq = 440,*/ amp = 0.4, pan = 0, decay = 1, x, y;
	var rand = Rand(x,y) / 8;
	var freq = XLine.kr(rand,1,3);
    var env, snd;
	env = Env.perc(releaseTime: decay, level: amp).kr(doneAction: 2);
	snd = Pulse.ar(freq, 0.25, 0.75);
	snd = snd * env;
	Out.ar(out, Pan2.ar(snd, pan));
}).add;
)

(
SynthDef("blips1", {
	arg out = 0, /*freq = 25,*/ numharm = 10, att = 0.01, decay = 1, amp = 0.1, pan = 0.5, x, y;
	var snd, env;
	var rand = Rand(x,y) / 8;
	var freq = XLine.kr(rand,1,3);
	env = Env.perc(att, decay, amp).kr(doneAction: 2);
	snd = LeakDC.ar(Mix(Blip.ar([freq, freq*1.01], numharm, env)));
	Out.ar(out, Pan2.ar(snd, pan));
}).add;
)


(

a = Pbind(
	\instrument, \decay,
	\dur, Pseq([1],285),
	\amp, Pseq([1],285),
	\x, 100,
	\y, 10000,
);

b = Pbind(
	\instrument, \boom,
	\dur, Pseq([0, 5,0],1),
	\amp, Pseq([0, 0.5,0]),
);

c = Pbind(
	\instrument, \sax,
	\dur, Pseq([1],175),
	\amp, Pseq([1],175),
	\x, 100,
	\y, 10000,
);

d = Pbind(
	\instrument, \organ,
	\dur, Pseq([1],175),
	\amp, Pseq([1],175),
	\x, 100,
	\y, 10000,
);

e = Pbind(
	\instrument, \waveguideFlute,
	\dur, Pseq([1],175),
	\amp, Pseq([1],175),
	\x, 100,
	\y, 10000,
);

f = Pbind(
	\instrument, \harpsichord1,
	\dur, Pseq([1],175),
	\amp, Pseq([1],175),
	\x, 100,
	\y, 10000,
);

g = Pbind(
	\instrument, \blips1,
	\dur, Pseq([1],175),
	\amp, Pseq([1],175),
	\x, 100,
	\y, 10000,
);


Ptpar([0.011076,b, 0.011076,a, //Solwind + missile
	2.64195614,b, //Mir + Soyuz
	3.72800414,b, 3.72800414,d, //Mir + Progress-M 34
	6.19213214,b, 6.19213214,e, //DART + MUBLCOM
	11.190358,b, 11.190358,f, //Fengyun 1C + missile
	11.5411392,b, 11.5411392,g, //USA-193 + missile
	11.84895692,b, 11.84895692,c, //Iridium 33 + Kosmos 2251
	13.5386899200,b, 13.5386899200,a, //Fengyun 1C DEB + BLITS
	15.4487009,b, 15.4487009,a /*Microsat-R + missile */]).play;
//Ptpar([0,a]).play;

)






//1985 - 2019
//Randomize different parameters sdo each peice sound different
//trigger certian collisons manually
//background ambient noise
//trigger big crash then utilise Xline to similate debris falling
//Make sure the soubds ends



//ideas
// see the delta values in the resulting events
(
var a, b, c, t;
a = Pbind(\x, Pseq([1, 2, 3, 4]), \dur, 1);
b = Pbind(\x, Pseq([10, 20, 30, 40]), \dur, 0.4);
c = Ptpar([0.0, a, 1.3, b]);
t = c.asStream;
20.do({ t.next(Event.default).postln; });
)

// sound example
(
var a, b;
a = Pbind(\note, Pseq([7, 4, 0], 4), \dur, Pseq([1, 0.5, 1.5], inf));
b = Pbind(\note, Pseq([5, 10, 12], 4), \dur, 1);
Ptpar([ 0.0, a, 1.3, b ]).play;
)