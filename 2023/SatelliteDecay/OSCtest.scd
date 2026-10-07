s.makeWindow.boot;


{ Blip.ar(200,Line.kr(1,100,20),0.2) }.play;

{ Blip.ar(XLine.kr(20000,200,6),100,0.2) }.play;

{ Impulse.ar(4, [0, MouseX.kr(0, 1)], 0.2) }.play;

{ Impulse.ar(800, 0.0, 0.5, 0) }.play

{ Impulse.ar(XLine.kr(800,100,5), 0.0,  0.5, 0) }.play

SynthDef(\imp, { OffsetOut.ar(0, Impulse.ar(0)); FreeSelf.kr(Impulse.kr(0)); }).add;
fork { (1 / (1..60).scramble).do { |dt| Synth.grain(\imp);  dt.wait } };

b = NetAddr.new("127.0.0.1", 7771);    // create the NetAddr
b.sendMsg("/hello", "there");    // send the application the message "hello" with the parameter "there"

NetAddr.langPort;    // retrieve the current port SC is listening to
NetAddr.localAddr    // retrieve the current IP and port
x`
n = NetAddr.new("127.0.0.1", 7771);    // create the NetAddr
// create the OSCFunc
o = OSCFunc({ arg msg, time, addr, recvPort; [msg, time, addr, recvPort].postln; }, '/goodbye');
o.free;    // remove the OSCFunc when you are done.

thisProcess.openUDPPort(7800); // attempt to open 1121
thisProcess.openPorts; // list all open ports


x = Synth(\default);
OSCFunc({ 'ended!'.postln; x.release(3) }, '/n_end');
x.release(3);

Pan2.animate
