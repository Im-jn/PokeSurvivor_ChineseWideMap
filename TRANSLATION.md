# 一键汉化 v1.7

游戏页面右下角点击“一键汉化”开启，点击“中文已开 · 恢复原文”关闭。菜单即刻更新，Canvas 战斗文字在下一帧更新。开关保存在网站本地存储的 `ps.widemap.zh.enabled.v1`，不更改游戏自身语言设置。清除网站数据也会清除此偏好。

## 范围

- 对照游戏截至 2026-10-16 的英西词表，翻译了 1,154 条游戏文本，另补充性格、地区、缩写等词条。
- 宝可梦名称和招式名称使用 PokeAPI 的简体中文名称表，包含第九世代；游戏中的道具、技能说明及专有机制按游戏实际效果翻译。
- 支持英语及西班牙语来源，包含动态插值（数量、宝可梦、招式名称）、新增 DOM、提示属性、按钮标签、Canvas `fillText/strokeText/measureText` 及浏览器确认/提示框。
- 采用“异色”“羁绊”“裂隙”“招式进化”“携带道具”等统一术语。“永久强化”为局外强化，“强化”为局内提升。
- 跳过玩家输入、可编辑区、代码，以及游戏标记 `translate="no"` 的内容（主要为昵称，也包含部分公告和语言选项）。无法识别的文本保留原文，图片内文字不会替换。游戏未来更新的公告、新增词条或绕过这些绘制接口的文本可能需要补充。

## 实现与维护

`manifest.json` 在页面环境的 `document_start` 阶段依次加载 `capture.js`、`zh-dictionary.js` 和 `zh-translate.js`。原有隔离环境中的 `overlay.js` 不变。

`zh-dictionary.js` 的 `phrases` 为英/西原文到简体中文的映射，`names` 为宝可梦名称，`rawSlots` 标出含玩家昵称的动态占位符。这些槽位保留原文，其他槽位递归转换宝可梦和招式等术语。精确短句优先于动态模板，再按完整单词边界替换词组。缓存数量有上限。DOM 原文通过 WeakMap 记录，关闭时只恢复仍由本扩展生成的文本，避免覆盖游戏新内容。

补词可直接编辑 `zh-dictionary.js`，或更新 `tools/translation/zh-lines.txt` 后运行 `node tools/translation/build-dictionary.cjs`。后者使用同目录保存的源词表生成文件；行号对应 `en-entries.json` 的条目顺序，`{x}` 的数量和顺序必须一致。宝可梦/招式 CSV 仅在生成词库时读取，扩展运行不请求网络、不上传内容，也不添加额外扩展权限。

## 验证

运行 `node --test tests/translation.test.cjs` 可执行无需依赖的词库回归测试（名称对应、动态模板、昵称槽位、完整单词匹配及占位符完整性）。

- 两个新增脚本及两个原有脚本通过 Node 语法检查，清单引用的文件均存在。
- Edge 无头浏览器自动验证：名称与招式、动态模板、动态节点与属性、昵称/输入框保护、小地图排除、Canvas 绘制与测量、关闭还原、刷新后记忆，以及与官方英语 MutationObserver/Canvas 包装器共同运行。
- 在独立浏览器上下文加载实际官方页面，使用全新游客进度走过启动、登录、性格测试、伙伴选择、主菜单、开始对局、暂停及恢复原文；未出现页面脚本错误。没有使用用户账号，未进行多人对局或穷举每个任务/事件。

## 数据来源

- [PokéSurvivor 官方仓库](https://github.com/JPTER78/pokesurvivor)：`js/data/lang-en.js`、`js/core/i18n.js`、`js/data/starters.js`，用于核对词条、动态模板和语言接口。
- [PokeAPI](https://github.com/PokeAPI/pokeapi)：`data/v2/csv/pokemon_species_names.csv` 和 `move_names.csv`，使用语言编号 12（简体中文）、9（英语）和 7（西班牙语）的名称对应关系。
- 中文游戏说明为本扩展针对游戏语境整理的翻译。Pokémon 名称及角色权益归各自权利人所有。本扩展为非官方、本地、非商业辅助工具。
