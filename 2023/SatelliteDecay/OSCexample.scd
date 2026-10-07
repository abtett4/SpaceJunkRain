n = NetAddr("127.0.0.1", NetAddr.langPort); // local machine

OSCFunc.newMatching({|msg, time, addr, recvPort| \matching.postln}, '/chat', n); // path matching
OSCFunc({|msg, time, addr, recvPort| \oneShot.postln}, '/chat', n).oneShot; // once only
OSCdef(\test, {|msg, time, addr, recvPort| \unmatching.postln}, '/chat', n); // def style

m = NetAddr("127.0.0.1", NetAddr.langPort); // loopback

m.sendMsg("/chat", "Hello App 1");
m.sendMsg("/chat", "Hello App 1"); // oneshot gone
m.sendMsg("/ch?t", "Hello App 1");
m.sendMsg("/*", "Hello App 1");
m.sendMsg("/chit", "Hello App 1"); // nothing

// Introspection

AbstractResponderFunc.allFuncProxies
AbstractResponderFunc.allEnabled
OSCdef(\test).disable;
AbstractResponderFunc.allDisabled

// change funcs
OSCdef(\test).enable;
OSCdef(\test, {|msg, time, addr, recvPort| 'Changed Unmatching'.postln}, '/chat', n); // replace at key \test
m.sendMsg("/chat", "Hello App 1");
OSCdef(\test).add(f = {\foo.postln}); // add another func
m.sendMsg("/chat", "Hello App 1");
OSCdef(\test).clear; // remove all functions
m.sendMsg("/chat", "Hello App 1");

//////// Use an argTemplate for finer grained matching

s.boot;
x = Synth(\default);
OSCFunc({ 'ended!'.postln }, '/n_end', s.addr, nil, [x.nodeID]).oneShot;
x.release(3);