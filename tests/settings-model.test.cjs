'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Model = require('../settings-model.js');
test('rotation speed migrates and preserves independent gathering and appearance settings',()=>{
  assert.equal(Model.normalize().motion.rotationSpeed,1);
  assert.equal(Model.normalize({motion:{rotationSpeed:0}}).motion.rotationSpeed,.25);
  assert.equal(Model.normalize({motion:{rotationSpeed:99}}).motion.rotationSpeed,2);
  assert.equal(Model.normalize({motion:{rotationSpeed:NaN}}).motion.rotationSpeed,1);
  const original=Model.normalize({motion:{gatherSpeed:1.75},text:{name:{fontSize:75}}});
  const edited=Model.merge(original,{motion:{rotationSpeed:1.5}});
  assert.equal(edited.motion.rotationSpeed,1.5);assert.equal(edited.motion.gatherSpeed,1.75);
  assert.deepEqual(edited.text,original.text);
  assert.equal(Model.merge(edited,{motion:{gatherSpeed:.5}}).motion.rotationSpeed,1.5);
});
test('gather speed migrates, clamps and survives unrelated settings edits',()=>{
  assert.equal(Model.normalize({autoPlay:false}).motion.gatherSpeed,1);
  assert.equal(Model.normalize({motion:{gatherSpeed:0}}).motion.gatherSpeed,.25);
  assert.equal(Model.normalize({motion:{gatherSpeed:100}}).motion.gatherSpeed,3);
  assert.equal(Model.normalize({motion:{gatherSpeed:NaN}}).motion.gatherSpeed,1);
  const original=Model.normalize({motion:{gatherSpeed:.5},text:{name:{fontSize:75}}});
  const edited=Model.merge(original,{autoPlay:false});
  assert.equal(edited.motion.gatherSpeed,.5);
  const faster=Model.merge(edited,{motion:{gatherSpeed:2}});
  assert.equal(faster.motion.gatherSpeed,2);assert.deepEqual(faster.text,original.text);
});

test('old autoPlay-only settings migrate with all appearance defaults', () => {
  const settings = Model.normalize({ autoPlay: false });
  assert.equal(settings.autoPlay, false);
  assert.equal(settings.text.name.font, 'Arial');
  assert.equal(settings.layout.iconSize, 210.6);
  assert.equal(settings.uiLanguage, 'zh-CN');
});

test('changing console language and reset keep saved appearance and enable state', () => {
  const original = Model.normalize({ autoPlay: false, text: { name: { fontSize: 75 } } });
  const english = Model.merge(original, { uiLanguage: 'en' });
  assert.equal(english.uiLanguage, 'en'); assert.equal(english.autoPlay, false); assert.deepEqual(english.text, original.text);
  assert.equal(Model.normalize({ uiLanguage: 'invalid' }).uiLanguage, 'zh-CN');
});
test('enable/disable preserves customized fonts, position, and size', () => {
  const original = Model.normalize({ text: { name: { font: 'Consolas', fontSize: 75, x: 100 } }, layout: { iconSize: 330, y: 62 } });
  const disabled = Model.merge(original, { autoPlay: false });
  assert.equal(disabled.autoPlay, false);
  assert.deepEqual(disabled.text, original.text);
  assert.deepEqual(disabled.layout, original.layout);
});
test('clamp corrupt/out-of-range values and reject unrecognized font strings', () => {
  const settings = Model.normalize({ layout: { x: 999, iconSize: NaN }, text: { name: { font: 'invalid;url(secret)', spacing: -100, y: Infinity } } });
  assert.equal(settings.layout.x, 100);
  assert.equal(settings.layout.iconSize, Model.defaults.layout.iconSize);
  assert.equal(settings.text.name.font, 'Arial');
  assert.equal(settings.text.name.spacing, 0);
  assert.equal(settings.text.name.y, 0);
});
test('partial edits preserve other rows and return independently owned objects', () => {
  const original = Model.normalize();
  const edited = Model.merge(original, { text: { name: { fontSize: 66 } } });
  assert.equal(edited.text.name.fontSize, 66);
  assert.deepEqual(edited.text.motto, original.text.motto);
  edited.text.motto.x = 50;
  assert.equal(original.text.motto.x, 0);
});
test('color edits preserve appearance, migrate old settings and reject non-color input',()=>{
  const original=Model.normalize({autoPlay:false,layout:{openingIconSize:62},text:{name:{fontSize:75}}});
  const edited=Model.merge(original,{colors:{openingStart:'#FF0099',name:'#AABBCC',brandIcon:'url(secret)'}});
  assert.equal(edited.colors.openingStart,'#ff0099');assert.equal(edited.colors.name,'#aabbcc');
  assert.equal(edited.colors.brandIcon,Model.defaults.colors.brandIcon);assert.equal(edited.colors.caption,original.colors.caption);
  assert.deepEqual(edited.layout,original.layout);assert.deepEqual(edited.text,original.text);assert.equal(edited.autoPlay,false);
});
