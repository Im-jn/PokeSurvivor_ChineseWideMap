const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const context = vm.createContext({
  document:{readyState:'loading', addEventListener() {}},
  localStorage:{getItem() { return null; }}, addEventListener() {},
});
context.window = context;
for (const file of ['zh-dictionary.js','zh-translate.js']) vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
const t = value => context.__PS_ZH_TRANSLATOR__.translate(value);

test('official Pokemon, move and held-item names', () => {
  assert.equal(t('Bulbasaur · Pikachu · Charizard · Mew · Type: Null'),'妙蛙种子 · 皮卡丘 · 喷火龙 · 梦幻 · 属性：空');
  assert.equal(t('Thunderbolt · Shadow Ball · Leftovers'),'十万伏特 · 暗影球 · 吃剩的东西');
  assert.equal(t('Placaje · Látigo Cepa'),'撞击 · 藤鞭');
});
test('dynamic events and attribute names in English and Spanish', () => {
  assert.equal(t('A wild shiny Eevee appeared!'),'野生的异色 伊布 出现了！');
  assert.equal(t('Defeat 50 Fire-type Pokémon'),'击败 50 只火属性宝可梦');
  assert.equal(t('SHADY FOREST · 12 DEFEATED · 5 COINS'),'幽暗森林 · 击败 12 · 金币 5');
  assert.equal(t('Nv. 12'),'等级 12');
  assert.equal(t('Impulsivo'),'冲动');
});
test('player names in templates and whole-word matching', () => {
  assert.equal(t('Pikachu invites you to play in their room'),'Pikachu 邀请你加入房间游玩');
  assert.equal(t('Waiting for Ash…'),'正在等待 Ash…');
  assert.equal(t('Playback attackSpeed playerFire'),'Playback attackSpeed playerFire');
  assert.equal(t('  Play\n'),'  开始游戏\n');
  assert.equal(t('一些中文 · 123'),'一些中文 · 123');
  assert.equal(t(null),null);
});
test('all translated templates retain their placeholder count', () => {
  for (const [source,target] of Object.entries(context.__PS_ZH_DATA__.phrases)) {
    assert.equal((source.match(/\{x\}/g)||[]).length,(target.match(/\{x\}/g)||[]).length,source);
  }
});
test('every Pokemon name alias resolves to its Chinese name', () => {
  for (const [source,target] of Object.entries(context.__PS_ZH_DATA__.names)) assert.equal(t(source),target,source);
});


test('2026-10-19 controller, collection, stats, aiming and cloud updates', () => {
  assert.equal(t('Nasty Plot'), '诡计');
  assert.equal(t('Sp. Atk · Sp. Def · Physical · Special'), '特攻 · 特防 · 物理 · 特殊');
  assert.equal(t('Controller connected'), '手柄已连接');
  assert.equal(t('Buscar por nombre o número'), '按名称或编号搜索');
  assert.equal(t('Mark as favorite'), '添加到收藏');
  assert.equal(t('Manual aim'), '手动瞄准');
  assert.equal(t('Saving to the cloud in 5 s.'), '5 秒后保存至云端。');
  assert.equal(t('With Flamethrower it deals 120 %: it hits harder with special moves.'), '使用 喷射火焰 时造成 120% 伤害：更擅长使用特殊招式。');
  assert.equal(t('7 physical'), '7 物理');
  assert.equal(t('7 especial'), '7 特殊');
  assert.equal(t('12 Pokémon'), '12 只宝可梦');
});

test('all tracked upstream phrases have both Spanish and English translations', () => {
  const upstream = JSON.parse(fs.readFileSync(path.join(root, 'tools/translation/en-entries.json'), 'utf8'));
  for (const [spanish, english] of Object.entries(upstream)) {
    assert.ok(context.__PS_ZH_DATA__.phrases[spanish], spanish);
    assert.ok(context.__PS_ZH_DATA__.phrases[english], english);
  }
});
