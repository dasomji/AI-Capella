import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import postcss from 'postcss';

const root = fileURLToPath(new URL('../', import.meta.url));
const baselinePath = path.join(root, 'scripts/design-token-baseline.json');
// Migration ceiling: the merged production source before AICAP-28. Even editing the
// baseline cannot admit a new violation: every entry must exist in this source.
const legacyCommit = '3c9d43c';
const colorAtom = /#[\da-f]{3,8}\b|(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch|color)\([^)]*\)/gi;
const namedColors = new Set(('aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen').split(' '));
const fontStack = /(?:['"](?:Atkinson[^'";]+|Bodoni[^'";]+|Baltimore[^'";]+|Remington[^'";]+|Modern Antique[^'";]+|Italianno|LightScore Engraving|Bravura)['"][^;\n]*|(?:system-ui|ui-monospace|sans-serif|monospace|\bserif\b|\bcursive\b))/g;
const paletteClass = /(?:^|\s)tw:(?:[\w-]+:)*(?:bg|text|border|outline|ring|fill|stroke|shadow|from|via|to|decoration|accent|caret)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(?:-\d+)?(?:\/\d+)?\b/g;
const arbitraryAesthetic = /(?:^|\s)tw:(?:[\w-]+:)*(?:(?:bg|text|border|outline|ring|fill|stroke|font|rounded|shadow|tracking|leading|opacity|duration|ease|from|via|to)-\[[^\]]+\]|\[(?:color|background|font|border|box-shadow|border-radius)[^\]]*\])/g;
const defaultFont = /(?:^|\s)tw:(?:[\w-]+:)*font-(?:sans|serif|thin|extralight|light|normal|medium|semibold|bold|extrabold|black)\b/g;
const designProp = /^(?:color|background(?:-color)?|border(?:-[\w-]+)?|outline(?:-[\w-]+)?|fill|stroke|box-shadow|text-shadow|accent-color|caret-color|stop-color|flood-color)$/;
const sinkName = /(?:fillStyle|strokeStyle|shadowColor|color|background|backgroundColor|borderColor|outlineColor|font|innerHTML|outerHTML)$/;
const assetFaces = new Set(['LightScore Engraving', 'Bravura', 'Baltimore Title 1832', 'Baltimore Bold 1832', 'Modern Antique 1889', 'Remington 1888', 'Baltimore Black Slope 1832']);
const allowed = new Set(['src/design-system/tokens.css']);
const normalize = text => text.replace(/\s+/g, ' ').trim();
const key = entry => JSON.stringify([entry.file, entry.kind, entry.context, entry.value]);
function productFile(file) {
  return /^(src|server|public)\//.test(file) && /\.(?:css|[cm]?[jt]sx?|svg|webmanifest)$/.test(file) && !/(?:routeTree\.gen|\.test)\./.test(file);
}
function files(dir = root) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const p = path.join(dir, entry.name), rel = path.relative(root, p);
    if (entry.isDirectory()) return /^(src|server|public)(?:\/|$)/.test(rel) ? files(p) : [];
    return productFile(rel) ? [rel] : [];
  });
}
export function scanDesignFile(file, source) {
  if (allowed.has(file)) return [];
  const entries = [];
  const add = (kind, context, value) => entries.push({ file, kind, context: normalize(context), value: normalize(value) });
  function colors(text, context, names = false) {
    for (const match of text.matchAll(colorAtom)) add('raw-color', context, match[0]);
    // Literal channels in a template head, e.g. rgba(255,244,228,${alpha}),
    // are still pigments even though the alpha expression splits the string.
    for (const match of text.matchAll(/(?:rgba?|hsla?)\(\s*\d+(?:\.\d+)?%?\s*[, ]\s*\d+(?:\.\d+)?%?\s*[, ]\s*\d+(?:\.\d+)?%?[^)]*$/gi)) add('raw-template-channels', context, match[0]);
    if (names) {
      const withoutVars = text.replace(/var\(\s*--[^,)]+(?:,\s*)?/g, '').replace(/url\([^)]*\)/g, '');
      for (const word of withoutVars.match(/\b[a-z]+\b/gi) ?? []) if (namedColors.has(word.toLowerCase())) add('named-color', context, word);
    }
  }
  function classes(text, context) {
    for (const match of text.matchAll(paletteClass)) add('palette-utility', context, match[0]);
    for (const match of text.matchAll(arbitraryAesthetic)) add('arbitrary-aesthetic', context, match[0]);
    for (const match of text.matchAll(defaultFont)) add('default-font-utility', context, match[0]);
  }
  if (file.endsWith('.css')) {
    const tree = postcss.parse(source);
    tree.walkDecls(decl => {
      const ancestry = []; let node = decl.parent;
      while (node && node.type !== 'root') { ancestry.unshift(node.selector ?? `@${node.name} ${node.params ?? ''}`); node = node.parent; }
      const context = ancestry.join(' / ') + ' / ' + decl.prop;
      if (decl.parent.type === 'atrule' && decl.parent.name === 'font-face' && decl.prop === 'font-family' && assetFaces.has(decl.value.replace(/^['"]|['"]$/g, ''))) return;
      colors(decl.value, context, designProp.test(decl.prop) || decl.prop.startsWith('--'));
      if (/^(?:font|font-family)$/.test(decl.prop) && fontStack.test(decl.value)) add('raw-font', context, decl.value);
      fontStack.lastIndex = 0;
      if (/--pigment-/.test(decl.value)) add('primitive-import', context, decl.value);
    });
    tree.walkRules(rule => {
      if (file.startsWith('src/design-system/')) return;
      if (/(?:^|[\s>+~])(?:button|input|select|textarea)(?:[\s.:[>#]|$)/.test(rule.selector) && /[.#][\w-]+/.test(rule.selector)) add('screen-control-selector', rule.selector, rule.selector);
    });
    return entries;
  }
  if (!/\.[cm]?[jt]sx?$/.test(file)) { colors(source, 'asset'); return entries; }
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  function context(node) {
    let current = node;
    while (current.parent && !ts.isSourceFile(current.parent)) {
      if ((ts.isVariableDeclaration(current) || ts.isFunctionDeclaration(current) || ts.isMethodDeclaration(current) || ts.isPropertyDeclaration(current)) && current.name) return current.name.getText(ast);
      current = current.parent;
    }
    return current.getText(ast).slice(0, 100);
  }
  // Conservative local flow: numeric tuples / channel strings taint their containing
  // declaration, then declarations that refer to them. Only paths reaching a visual
  // sink are reported; pitch/geometry triples alone are not design violations.
  const sources = new Map(), declarations = new Map();
  function collect(node) {
    if ((ts.isVariableDeclaration(node) || ts.isParameter(node)) && node.initializer && ts.isIdentifier(node.name)) declarations.set(node.name.text, node.initializer);
    ts.forEachChild(node, collect);
  }
  collect(ast);
  function rawChannels(node, result = []) {
    if (ts.isArrayLiteralExpression(node) && node.elements.length === 3 && node.elements.every(n => ts.isNumericLiteral(n) && +n.text >= 0 && +n.text <= 255)) result.push(node.getText(ast));
    if (ts.isStringLiteralLike(node) && /^\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}$/.test(node.text)) result.push(node.getText(ast));
    ts.forEachChild(node, child => { rawChannels(child, result); }); return result;
  }
  for (const [name, init] of declarations) { const raw = rawChannels(init); if (raw.length) sources.set(name, new Set(raw)); }
  function references(node) { const ids = []; function visit(n) { if (ts.isIdentifier(n)) ids.push(n.text); ts.forEachChild(n, visit); } visit(node); return ids; }
  for (let changed = true; changed;) {
    changed = false;
    for (const [name, init] of declarations) for (const id of references(init)) for (const value of sources.get(id) ?? []) {
      const set = sources.get(name) ?? new Set(); if (!set.has(value)) { set.add(value); sources.set(name, set); changed = true; }
    }
  }
  function checkSink(node) {
    for (const raw of rawChannels(node)) add('raw-channels-at-sink', context(node), raw);
    for (const id of references(node)) for (const raw of sources.get(id) ?? []) add('raw-channels-at-sink', context(node) + ' <- ' + id, raw);
  }
  function visit(node) {
    if (ts.isTemplateExpression(node) && /hsla?\(/i.test(node.head.text) && /\d+(?:\.\d+)?%/.test(node.templateSpans.map(span => span.literal.text).join(''))) add('raw-hsl-template', context(node), node.getText(ast));
    if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      const text = node.text, owner = context(node);
      // safe-svg's exact expected renderer CSS is a protocol/security contract.
      // It stays visible in the immutable legacy ceiling; no file-wide exclusion.
      const protocol = file === 'src/safe-svg.ts' && createHash('sha256').update(text).digest('hex') === 'a2eac41dcdc8619d76a7fa20a204e3493f6db8670d9f659c9ad2f71f1622731c';
      if (!protocol) colors(text, owner, namedColors.has(text.toLowerCase()) || /(?:fill|stroke|color|background(?:-color)?)\s*[:=]/i.test(text));
      if (fontStack.test(text)) add('raw-font', owner, text);
      fontStack.lastIndex = 0;
      classes(text, owner);
      if (/--pigment-/.test(text)) add('primitive-import', owner, text);
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && sinkName.test(node.left.getText(ast).split('.').at(-1))) checkSink(node.right);
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const name = node.expression.name.text;
      if (name === 'addColorStop' && node.arguments[1]) checkSink(node.arguments[1]);
      if (['setAttribute', 'setProperty'].includes(name) && node.arguments[0] && /^(?:fill|stroke|style|color|font-family|--[\w-]+)$/.test(node.arguments[0].text ?? '') && node.arguments[1]) checkSink(node.arguments[1]);
    }
    if (/^src\/design-system\/recipes(?:\/|\.ts)/.test(file) && ts.isImportDeclaration(node)) {
      if (!/^\.\/?(?:recipes\/)?/.test(node.moduleSpecifier.text) || /(?:react|dom|design|theme|state)/i.test(node.moduleSpecifier.text)) add('recipe-boundary', 'import', node.moduleSpecifier.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return entries;
}
function aggregate(entries) {
  const result = new Map(); for (const entry of entries) { const k = key(entry); const row = result.get(k) ?? { ...entry, count: 0 }; row.count++; result.set(k, row); }
  return [...result.values()].sort((a, b) => key(a).localeCompare(key(b)));
}
function observations(read, paths) { return aggregate(paths.flatMap(file => scanDesignFile(file, read(file)))); }
export function checkBaseline(actual, baseline, ceiling) {
  const errors = [], current = new Map(actual.map(row => [key(row), row.count]));
  const approved = new Map(baseline.map(row => [key(row), row.count]));
  const original = new Map(ceiling.map(row => [key(row), row.count]));
  for (const row of actual) if ((approved.get(key(row)) ?? 0) < row.count) errors.push(`NEW ${key(row)} (${row.count} > ${approved.get(key(row)) ?? 0})`);
  for (const row of baseline) {
    if (current.get(key(row)) !== row.count) errors.push(`STALE baseline: remove/update ${key(row)} (${row.count} → ${current.get(key(row)) ?? 0})`);
    if ((original.get(key(row)) ?? 0) < row.count) errors.push(`BASELINE GREW beyond production ceiling: ${key(row)}`);
  }
  return errors;
}
function main() {
  const actual = observations(file => fs.readFileSync(path.join(root, file), 'utf8'), files());
  const originalPaths = execFileSync('git', ['ls-tree', '-r', '--name-only', legacyCommit], { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(productFile);
  const ceiling = observations(file => execFileSync('git', ['show', `${legacyCommit}:${file}`], { cwd: root, encoding: 'utf8', maxBuffer: 4e6 }), originalPaths);
  if (process.argv.includes('--initialize-baseline')) {
    if (fs.existsSync(baselinePath)) throw Error('Baseline already exists; remove resolved entries explicitly. It may only shrink.');
    const errors = checkBaseline(actual, actual, ceiling); if (errors.length) throw Error(errors.join('\n'));
    fs.writeFileSync(baselinePath, JSON.stringify({ legacyCommit, entries: actual }, null, 2) + '\n');
  }
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  if (baseline.legacyCommit !== legacyCommit) throw Error('Cannot change the legacy production ceiling');
  const errors = checkBaseline(actual, baseline.entries, ceiling);
  const reference = process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : 'HEAD';
  let previous;
  try { previous = JSON.parse(execFileSync('git', ['show', `${reference}:scripts/design-token-baseline.json`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })); } catch { /* First foundation commit has no baseline yet. */ }
  if (previous) {
    const cap = new Map(previous.entries.map(row => [key(row), row.count]));
    for (const row of baseline.entries) if ((cap.get(key(row)) ?? 0) < row.count) errors.push(`BASELINE GREW since ${reference}: ${key(row)}`);
  }
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log(`Design token guard passed: ${actual.length} exact legacy entries (${actual.reduce((sum, row) => sum + row.count, 0)} occurrences); zero new violations.`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
