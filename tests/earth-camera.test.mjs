import test from 'node:test';
import assert from 'node:assert/strict';
import { CameraController } from '../web/earth/CameraController.js';

function fixture() {
  const element = new EventTarget();
  element.focus = element.setPointerCapture = () => {};
  const calls = [];
  const camera = new CameraController(element, () => calls.push('draw'), {
    hover: p => calls.push(['hover', p]), inspect: p => calls.push(['inspect', p]), clear: () => calls.push('clear'),
  });
  const emit = (name, values = {}) => element.dispatchEvent(Object.assign(new Event(name, {cancelable:true}),
    {clientX:100,clientY:100,pointerId:1,...values}));
  return {camera,calls,emit};
}

test('pointer hover clears on leave and drag; a click inspects but a drag does not', () => {
  const {camera,calls,emit} = fixture();
  emit('pointermove'); assert.deepEqual(calls.pop(),['hover',[100,100]]);
  emit('pointerleave'); assert.deepEqual(calls.pop(),['hover',null]);
  emit('pointerdown'); assert.deepEqual(calls.pop(),['hover',null]);
  emit('pointerup'); assert.deepEqual(calls.pop(),['inspect',[100,100]]);
  calls.length=0;
  emit('pointerdown'); emit('pointermove',{clientX:130}); emit('pointerup',{clientX:130});
  assert.ok(calls.includes('draw'));
  assert.equal(calls.filter(c=>c[0]==='inspect').length,0);
  camera.dispose();
});

test('pinch, canceled pointers and disposal do not create accidental pins', () => {
  const {camera,calls,emit} = fixture();
  emit('pointerdown'); emit('pointerdown',{pointerId:2,clientX:150});
  emit('pointermove',{pointerId:2,clientX:200});
  assert.ok(camera.distance < 3.7);
  emit('pointerup',{pointerId:2}); emit('pointerup');
  emit('pointerdown'); emit('pointercancel'); emit('pointerup');
  assert.equal(calls.filter(c=>c[0]==='inspect').length,0);
  camera.dispose(); calls.length=0; emit('pointermove');
  assert.equal(calls.length,0);
});

test('keyboard supports center inspection, clearing, camera motion and bounded zoom', () => {
  const {camera,calls,emit} = fixture();
  emit('keydown',{key:'Enter'}); assert.deepEqual(calls.pop(),['inspect',null]);
  emit('keydown',{key:'Escape'}); assert.equal(calls.pop(),'clear');
  emit('keydown',{key:'ArrowRight'}); assert.ok(camera.yaw>0);
  camera.zoom(.001); assert.equal(camera.distance,2.05);
  camera.zoom(1000); assert.equal(camera.distance,6);
  camera.dispose();
});
