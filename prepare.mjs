import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(await fs.readFile(path.join(root, 'app.config.json'), 'utf8'));
const original = await fs.readFile(path.join(root, 'web/BLOOP.html'), 'utf8');
if (config.commerceEnabled !== false) throw new Error('Bu beta paketinde ödeme/reklam özellikleri kapalı kalmalıdır.');
const bundleId = process.env.BLOOP_BUNDLE_ID || config.bundleId;
if (!/^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*){2,}$/.test(bundleId)) throw new Error('Geçersiz bundleId.');
const buildNumber = String(process.env.BLOOP_BUILD_NUMBER || config.buildNumber);
if (!/^[1-9][0-9]*$/.test(buildNumber)) throw new Error('buildNumber pozitif tam sayı olmalıdır.');
export function makeMobileHtml(html) {
  const visibility = 'const commerceOpen=!practice&&game.level>10;';
  const gate = /function commerceAllowed\(\)\{[^\n]+?return true;\}/g;
  if (html.split(visibility).length !== 2 || [...html.matchAll(gate)].length !== 1) {
    throw new Error('Oyun kaynak yapısı değişti; beta mağaza kapatma işlemini inceleyin.');
  }
  return html.replace(visibility, 'const commerceOpen=false;')
    .replace(gate, "function commerceAllowed(){toast('Alışveriş ve reklam özellikleri bu betada kapalı.');return false;}")
    .replace('</head>', `<style id="bloop-mobile-beta">
html{-webkit-text-size-adjust:100%}body{overscroll-behavior-y:none}
[data-commerce],[data-product],[data-buy],[data-action="shop"],[data-action="pass"],
[data-action="rewardMoves"],[data-action="rewardHammer"],[data-action="confirmPurchase"],
[data-action="claimReward"]{display:none!important}
</style></head>`);
}
const mobile = makeMobileHtml(original);
for (const folder of ['android/app/src/main/assets/game', 'ios/BLOOP/Game']) {
  await fs.mkdir(path.join(root, folder), { recursive: true });
  await fs.writeFile(path.join(root, folder, 'index.html'), mobile, 'utf8');
}
const spec = {
  name: 'BLOOP',
  options: { deploymentTarget: { iOS: '15.0' }, createIntermediateGroups: true },
  targets: {
    BLOOP: {
      type: 'application', platform: 'iOS',
      sources: [
        { path: 'BLOOP', excludes: ['Game', 'Info.plist'] },
        { path: 'BLOOP/Game', type: 'folder', buildPhase: 'resources' }
      ],
      settings: { base: {
        PRODUCT_BUNDLE_IDENTIFIER: bundleId,
        INFOPLIST_FILE: 'BLOOP/Info.plist',
        GENERATE_INFOPLIST_FILE: 'NO',
        SWIFT_VERSION: '5.0',
        TARGETED_DEVICE_FAMILY: '1,2',
        MARKETING_VERSION: config.version,
        CURRENT_PROJECT_VERSION: buildNumber,
        ASSETCATALOG_COMPILER_APPICON_NAME: 'AppIcon',
        CODE_SIGN_STYLE: 'Automatic'
      } }
    }
  },
  schemes: { BLOOP: { build: { targets: { BLOOP: 'all' } }, run: { config: 'Debug' }, archive: { config: 'Release' } } }
};
await fs.writeFile(path.join(root, 'ios/project.json'), JSON.stringify(spec, null, 2) + '\n');
console.log(`BLOOP hazır: ${bundleId}, ${config.version} (${buildNumber}); kaynak SHA-256: ${createHash('sha256').update(original).digest('hex')}`);
