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
		arg x, y;
		var sig, rand;
		rand = ExpRand(x, y);
		sig = Blip.ar(XLine.kr(rand,20,3),100,0.2);
		Out.ar([0,1,2,3,4], sig);
}).add;
)


(

a = Pbind(
	\instrument, \decay,
	\dur, Pseq([1], repeats: 175),
	\amp, Pseq([0,0.5,1,0],175),
	\x, 40,
	\y, 5000,

).play;

/*b = Pbind(
	\instrument, \boom,
	\dur, Pseq([0, 5,0],1),
	\amp, Pseq([0, 0.5,0]),
).play;*/

//Ptpar([0,b]).play;
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