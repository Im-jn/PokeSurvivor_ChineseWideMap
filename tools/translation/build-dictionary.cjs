const fs = require('node:fs');
const en = JSON.parse(fs.readFileSync('tools/translation/en-entries.json', 'utf8'));
const entries = Object.entries(en);
const zh = new Map(fs.readFileSync('tools/translation/zh-lines.txt', 'utf8').trim().split(/\r?\n/).map(line => {
  const [, id, value] = line.match(/^(\d+) (.*)$/); return [+id, value];
}));
function csv(file) {
  const rows = [], groups = new Map();
  // Names may contain commas and doubled quotes (e.g. Type: Null).
  for (const line of fs.readFileSync(file, 'utf8').trim().split(/\r?\n/).slice(1)) {
    const cols = []; let value = '', quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { if (quoted && line[i + 1] === '"') { value += c; i++; } else quoted = !quoted; }
      else if (c === ',' && !quoted) { cols.push(value); value = ''; } else value += c;
    }
    cols.push(value); rows.push(cols);
    if (!groups.has(cols[0])) groups.set(cols[0], {});
    groups.get(cols[0])[cols[1]] = cols[2];
  }
  return groups;
}
const moves = csv('tools/translation/moves.csv');
const moveNames = new Map();
for (const row of moves.values()) if (row[12]) for (const lang of [9, 7]) if (row[lang]) moveNames.set(row[lang].toLowerCase(), row[12]);
const phrases = {}, names = {}, rawSlots = {};
// Slots containing player-supplied names are not terminology.
const playerSlots = new Map([
  [225,[0]],[226,[0]],[362,[0]],[368,[0]],[524,[0]],
  [746,[0]],[768,[0]],[778,[0]],[779,[0]],[803,[0]],[808,[0]],
  [817,[0]],[924,[0]],[925,[0]],[1101,[0]],[1152,[0]],
]);
const missing = [];
for (const [[es, english], i] of entries.map((entry, i) => [entry, i])) {
  const chinese = zh.get(i) || moveNames.get(english.toLowerCase());
  if (!chinese) { missing.push([i, english]); continue; }
  if ((english.match(/\{x\}/g) || []).length !== (chinese.match(/\{x\}/g) || []).length) throw Error('Placeholder mismatch: ' + i);
  phrases[es] = chinese; phrases[english] = chinese;
  if (playerSlots.has(i)) rawSlots[es] = rawSlots[english] = playerSlots.get(i);
}
// Game abbreviations differ from PokeAPI's canonical spelling in a few places.
Object.assign(phrases, {
  'PokéCoins':'宝可金币', 'Pokécoin':'宝可金币', 'Shiny':'异色', 'Shinies':'异色宝可梦',
  'Kanto':'关都', 'Johto':'城都', 'Hoenn':'丰缘', 'Sinnoh':'神奥', 'Unova':'合众', 'Kalos':'卡洛斯',
  'Alola':'阿罗拉', 'Galar':'伽勒尔', 'Paldea':'帕底亚', 'Normal':'一般', 'Español':'西班牙语', 'English':'英语',
  'THE JUDGMENT':'审判', 'OF ARCEUS':'阿尔宙斯',
  'Crítico':'要害攻击', 'Crit':'要害', 'ATK':'攻击', 'DEF':'防御', 'HP':'体力', 'SPD':'速度',
  'damage':'伤害', 'cooldown':'冷却时间', 'pierce':'穿透', 'projectiles':'投射物', 'Boss':'首领',
  'Forgot your password?':'忘记密码？',
  'Si vinculaste tu Gmail, pulsa':'如果已绑定 Gmail，请点击',
  'con ese Gmail: es tu misma cuenta. Si no lo vinculaste, no se puede recuperar: crea una cuenta nueva (y esta vez vincula tu Gmail desde el aviso que sale al entrar).':'并使用该邮箱，即可登录原账号。未绑定邮箱则无法找回，请新建账号并及时绑定 Gmail。',
  'Vincula tu Gmail: si un día olvidas la contraseña, pulsas':'绑定 Gmail 后，即使忘记密码，也能点击',
  'y es tu misma cuenta, con todo lo tuyo.':'登录原账号，保留所有进度。',
  'January':'一月','February':'二月','March':'三月','April':'四月','May':'五月','June':'六月',
  'July':'七月','August':'八月','September':'九月','October':'十月','November':'十一月','December':'十二月',
  'enero':'一月','febrero':'二月','marzo':'三月','abril':'四月','mayo':'五月','junio':'六月',
  'julio':'七月','agosto':'八月','septiembre':'九月','octubre':'十月','noviembre':'十一月','diciembre':'十二月',
  'valiente':'勇敢','impulsivo':'冲动','prudente':'谨慎','leal':'忠诚','paciente':'耐心','dulce':'温柔',
  'tímido':'害羞','travieso':'顽皮','sereno':'沉着','astuto':'机敏','alegre':'开朗','tenaz':'坚毅',
  'orgulloso':'自信','solitario':'独立','tranquilo':'悠闲','caótico':'随性',
  'Nv. {x}':'等级 {x}', 'Lv. {x}':'等级 {x}',
  'If you linked your Gmail, sign in with Google using that Gmail: it is the same account. If you did not link it, it cannot be recovered: create a new account (and this time link your Gmail from the notice shown when you log in).':'如果已绑定 Gmail，请使用该邮箱通过 Google 登录，即可进入原账号。如果未绑定，则无法找回；请创建新账号并及时绑定 Gmail。',
});
for (const row of csv('tools/translation/species.csv').values()) {
  if (!row[12]) continue;
  for (const lang of [9, 7]) if (row[lang]) names[row[lang]] = row[12];
}
Object.assign(names, {'Type: Null':'属性：空', 'Nidoran♀':'尼多兰', 'Nidoran♂':'尼多朗', "Farfetch’d":'大葱鸭', "Sirfetch’d":'葱游兵', 'Flabébé':'花蓓蓓'});
if (missing.length) throw Error('Missing translations: ' + JSON.stringify(missing));
fs.writeFileSync('zh-dictionary.js', '/* Offline terminology: PokeAPI names + game-specific Simplified Chinese. See TRANSLATION.md. */\n(() => {\n\'use strict\';\nwindow.__PS_ZH_DATA__ = ' + JSON.stringify({phrases, names, rawSlots}, null, 2) + ';\n})();\n');
console.log(JSON.stringify({gameEntries: entries.length, phrases:Object.keys(phrases).length, speciesAliases:Object.keys(names).length}));
