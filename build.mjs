import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { adaptRuntime } from './src/adapt-runtime.mjs';
import { english } from './src/english.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const commit = fs.readFileSync(path.join(root, 'upstream/COMMIT.txt'), 'utf8').replace(/^\uFEFF/, '').trim();
const source = path.join(root, 'upstream', `dsh-startup-screen-${commit}`);
const adapted = path.join(root, 'adapted');
const app = path.join(root, 'build/app');
const web = path.join(app, 'web');
for (const dir of [adapted, app, web, path.join(web, 'dsh-startup/asset'), path.join(web, 'vendor'), path.join(app, 'licenses')]) {
  fs.mkdirSync(dir, { recursive: true });
}

function brand(text) {
  return text.replaceAll('DEEPSEEK HARNESS', 'CHATGPT DESKTOP')
    .replaceAll('DeepSeek Harness', 'ChatGPT Desktop')
    .replaceAll('DEEPSEEK', 'CHATGPT')
    .replaceAll('DeepSeek', 'ChatGPT')
    .replaceAll('深度求索', 'ChatGPT')
    .replaceAll('D E E P S E E K  ·  H A R N E S S', 'O P E N A I  ·  C H A T G P T')
    .replaceAll('D E E P S E E K', 'O P E N A I')
    .replaceAll("brand1: 'CHATGPT'", "brand1: 'OpenAI'")
    .replaceAll("brand2: 'SYNTHESIZE INTELLIGENCE'", "brand2: ''")
    .replaceAll("brand3a: 'HARNESS'", "brand3a: 'STARTUP'")
    .replaceAll("brand3b: 'OS'", "brand3b: 'PROTOCOL'")
    .replaceAll("orgEn: 'CHATGPT'", "orgEn: 'OPENAI'")
    .replaceAll("orgZh: 'ChatGPT'", "orgZh: ''")
    .replaceAll("orgSub: 'CHATGPT DESKTOP'", "orgSub: 'PERSONAL SESSION / WINDOWS'")
    .replaceAll("welcomeBox: 'CHATGPT DESKTOP'", "welcomeBox: 'ChatGPT'")
    .replaceAll('POWERED BY CHATGPT', 'SESSION / LOCAL')
    .replaceAll('REV 0.1.0 · WEB PROFILE', 'REV 1.1.0 · WINDOWS')
    .replaceAll("accent: '#ff7500'", "accent: '#10a37f'")
    .replaceAll("glitchA: '#ff3b30'", "glitchA: '#76d6c3'")
    .replaceAll("glitchB: '#2971b8'", "glitchB: '#3d8aa3'")
    .replaceAll('下次打开 DSH 生效', '下次从动画入口打开 ChatGPT 生效');
}

const logo = fs.readFileSync(path.join(root, 'assets/openai.svg'), 'utf8');
const logoPath = logo.match(/<path d="([^"]+)"/)[1];
const logoViewBox = logo.match(/viewBox="([^"]+)"/)[1];
const wordmark = fs.readFileSync(path.join(root, 'assets/openai-wordmark.svg'), 'utf8').trim();
fs.cpSync(path.join(source, 'lib'), path.join(adapted, 'lib'), { recursive: true });
fs.cpSync(path.join(source, 'test'), path.join(adapted, 'test'), { recursive: true });
fs.copyFileSync(path.join(source, 'package.json'), path.join(adapted, 'package.json'));

let splash = brand(fs.readFileSync(path.join(source, 'lib/splash.js'), 'utf8'));
const oldLogo = /var WHALE_PATH\s*=[\s\S]*?(?=\n\s*\/\* ── 默认配置)/;
if (!oldLogo.test(splash)) throw new Error('Upstream logo definition changed; review before adapting.');
splash = splash.replace(oldLogo, `var OPENAI_PATH = ${JSON.stringify(logoPath)}\n`)
  .replaceAll('svgWhale', 'svgOpenAI').replaceAll('WHALE_PATH', 'OPENAI_PATH')
  .replaceAll("'0 0 50 50'", JSON.stringify(logoViewBox));
splash = english(adaptRuntime(splash, wordmark));
fs.writeFileSync(path.join(adapted, 'lib/splash.js'), splash);
fs.writeFileSync(path.join(adapted, 'lib/index.js'), brand(fs.readFileSync(path.join(source, 'lib/index.js'), 'utf8')));

let client = brand(fs.readFileSync(path.join(source, 'lib/client.js'), 'utf8'));
// Keep the original React settings panel, exposing two options that the runtime
// already supports but the upstream panel does not provide controls for.
const visualMarker = "        /* 视觉 */";
const extraOptions = `        h('div', { className: '__ss_group' },
          h('div', { className: '__ss_groupTitle' }, '素材与色散'),
          h(Field, { label: '音效来源' }, h(Select, {
            value: draft.sfx || 'audio',
            options: [['audio', '内置素材'], ['synth', '现场合成']],
            onChange: (v) => set('sfx', v)
          })),
          h(Field, { label: '故障色 · 红' }, h(ColorInput, {
            value: draft.glitchA, onChange: (v) => set('glitchA', v)
          }))
        ),

`;
if (!client.includes(visualMarker)) throw new Error('Upstream settings structure changed.');
client = client.replace(visualMarker, extraOptions + visualMarker);
// On the desktop, this hint describes the real launcher/session semantics.
client = client.replace('每个浏览器会话一次', '每次桌面启动一次')
  .replaceAll('强调色 · 橙', '强调色 · OpenAI 绿')
  .replaceAll('故障色 · 红', '故障色 · A')
  .replaceAll('故障色 · 蓝', '故障色 · B')
  .replace('默认关闭；开启后', '开启后')
  .replace('素材缺失时无论选哪个都会自动回落到 TTS；终幕那句嵌了可配置的身份名称，始终走 TTS。',
    '前五句素材缺失时自动回落到 TTS；终幕沿用原版欢迎录音。')
  .replace('全部 WebAudio 现场合成，不含音频文件。', '支持内置素材和 WebAudio 现场合成。');
client = english(client);
fs.writeFileSync(path.join(adapted, 'lib/client.js'), client);
for (const name of fs.readdirSync(path.join(adapted, 'test')).filter(name => name.endsWith('.mjs'))) {
  const testFile = path.join(adapted, 'test', name);
  fs.writeFileSync(testFile, english(fs.readFileSync(testFile, 'utf8')));
}

for (const name of ['splash.js', 'splash.css', 'client.js']) {
  fs.copyFileSync(path.join(adapted, 'lib', name), path.join(web, 'dsh-startup', name));
}
fs.cpSync(path.join(source, 'lib/assets'), path.join(web, 'dsh-startup/asset'), { recursive: true });
fs.cpSync(path.join(root, 'assets/vendor'), path.join(web, 'vendor'), { recursive: true });
fs.cpSync(path.join(root, 'src/web'), web, { recursive: true });
fs.copyFileSync(path.join(root, 'assets/openai.svg'), path.join(web, 'openai.svg'));
fs.copyFileSync(path.join(root, 'assets/openai-wordmark.svg'), path.join(web, 'openai-wordmark.svg'));
fs.copyFileSync(path.join(root, 'assets/BRAND-SOURCES.json'), path.join(app, 'licenses/BRAND-SOURCES.json'));
fs.copyFileSync(path.join(root, 'README.md'), path.join(app, 'README.md'));
fs.copyFileSync(path.join(root, 'LICENSE'), path.join(app, 'licenses/LICENSE-project.txt'));
fs.copyFileSync(path.join(root, 'THIRD-PARTY-NOTICES.md'), path.join(app, 'licenses/THIRD-PARTY-NOTICES.md'));
fs.cpSync(path.join(root, 'assets/fonts'), path.join(web, 'fonts'), { recursive: true });
fs.copyFileSync(path.join(source, 'LICENSE'), path.join(app, 'licenses/LICENSE-dsh-startup-screen.txt'));
fs.copyFileSync(path.join(source, 'README.md'), path.join(app, 'licenses/UPSTREAM-README.md'));
fs.copyFileSync(path.join(root, 'assets/vendor/LICENSE-react.txt'), path.join(app, 'licenses/LICENSE-react.txt'));
fs.copyFileSync(path.join(root, 'assets/vendor/LICENSE-IBM-Plex.txt'), path.join(app, 'licenses/LICENSE-IBM-Plex.txt'));
fs.copyFileSync(path.join(root, 'runtime/webview2-sdk/LICENSE.txt'), path.join(app, 'licenses/LICENSE-WebView2.txt'));

const hostSource = fs.readFileSync(path.join(adapted, 'lib/index.js'), 'utf8');
const defaultsBlock = hostSource.match(/const DEFAULTS = (\{[\s\S]*?\r?\n\})\r?\n/)[1];
const defaults = vm.runInNewContext(`(${defaultsBlock})`);
fs.writeFileSync(path.join(app, 'defaults.json'), JSON.stringify(defaults, null, 2));
fs.writeFileSync(path.join(app, 'launcher.json'), JSON.stringify({
  appId: 'OpenAI.Codex_2p2nqsd0c76g0!App', version: '1.1.0-chatgpt.2',
  source: 'https://github.com/6shenhonghong9/dsh-startup-screen', commit
}, null, 2));

const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const audio = fs.readdirSync(path.join(source, 'lib/assets')).filter(name => name.endsWith('.mp3'));
const preservation = {
  source: 'https://github.com/6shenhonghong9/dsh-startup-screen', commit,
  upstreamVersion: JSON.parse(fs.readFileSync(path.join(source, 'package.json'))).version,
  settings: Object.keys(defaults),
  cssUnchanged: hash(path.join(source, 'lib/splash.css')) === hash(path.join(web, 'dsh-startup/splash.css')),
  brandReference: 'https://openai.com/brand/',
  adaptations: ['Official OpenAI wordmark and Blossom geometry', 'Local OpenAI Sans and IBM Plex Mono fonts',
    'Brand layout overlay', 'Audio start/end synchronization, voice lead and cancellable playback',
    'Original settings panel plus source/color options', 'Native Windows startup entry'],
  audio: audio.map(name => ({ name, sha256: hash(path.join(source, 'lib/assets', name)),
    unchanged: hash(path.join(source, 'lib/assets', name)) === hash(path.join(web, 'dsh-startup/asset', name)) }))
};
fs.writeFileSync(path.join(app, 'SOURCE-PRESERVATION.json'), JSON.stringify(preservation, null, 2));
console.log(JSON.stringify({ app, settings: Object.keys(defaults).length, originalAudio: audio.length,
  originalCss: preservation.cssUnchanged, sourceCommit: commit }));
