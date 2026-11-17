import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import postcss from 'postcss';

const root = fileURLToPath(new URL('../', import.meta.url));
const baselinePath = path.join(root, 'scripts/design-token-baseline.json');
const colorAtom = /#[\da-f]{3,8}\b|(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch|color)\([^)]*\)/gi;
const namedColors = new Set(('aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen').split(' '));
const fontStack = /(?:['"](?:Atkinson[^'";]+|Bodoni[^'";]+|Baltimore[^'";]+|Remington[^'";]+|Modern Antique[^'";]+|Italianno|LightScore Engraving|Bravura)['"][^;\n]*|(?:system-ui|ui-monospace|sans-serif|monospace|\bserif\b|\bcursive\b))/g;
const paletteClass = /(?:^|\s)tw:(?:[\w-]+:)*(?:bg|text|border|outline|ring|fill|stroke|shadow|from|via|to|decoration|accent|caret)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(?:-\d+)?(?:\/\d+)?\b/g;
// Every arbitrary-valued utility is covered, including nested selector variants.

const numberedName = /(?:-\d{4}-\d+|-\d{2,}|-\d+(?:px|rem|em|ms))(?:$|[^\w-])/;
// The semantic migration is complete: generated/value-encoding names cannot return.
export const enforceSemanticNames = true;
export function checkSemanticName(name) { return numberedName.test(name); }
const adapterTokens = new Set([...fs.readFileSync(path.join(root, 'src/design-system/tokens.css'), 'utf8').matchAll(/(--[\w-]+)\s*:\s*var\(--ds-/g)].map(m => m[1]));
function mappedScale(utility) {
  // A named color/type role can itself end in a numeral; verify the complete
  // explicitly authored adapter before interpreting a numeric default scale.
  const named = utility.match(/^(?:bg|text|border|outline|ring|fill|stroke|from|via|to|decoration|accent|caret)-(.+)$/);
  if (named && adapterTokens.has('--color-'+named[1])) return true;
  const match = utility.match(/^(-?)([a-z][\w-]*?)-(\d+(?:\.\d+)?|full)$/);
  if (!match) return true;
  const [, , prop, value] = match;
  const namespace = /^(?:p[xysetblr]?|m[xysetblr]?|gap(?:-[xy])?|space-[xy]|inset(?:-[xy])?|top|right|bottom|left|start|end|w|h|size|min-[wh]|max-[wh]|basis|translate-[xy])$/.test(prop) ? 'spacing' : ({duration:'duration',delay:'delay',z:'z-index',border:'border-width',rounded:'radius',opacity:'opacity',text:'text',leading:'leading',tracking:'tracking',blur:'blur',outline:'outline-width',ring:'ring-width',font:'font-weight'})[prop];
  // Grid counts, flex ratios, order and percentages describe structural layout.
  return /^(?:grid-cols|grid-rows|col-span|row-span|col-start|col-end|row-start|row-end|flex|shrink|grow|order|line-clamp)$/.test(prop) || adapterTokens.has(`--${namespace ?? prop}-${value}`) || (value === '0' && !['font','text'].includes(prop)) || (value === 'full' && namespace === 'spacing');
}

/** Named, structural exceptions for data that is not a theme value. */
export const exceptionRules = {
  'paper-noise-geometry': 'Paper formation/flocs/tooth triples are [cell count X, cell count Y, amplitude], never RGB channels.',
  'notation-stem-shape': 'black/half are engraving shape-table keys; changing these strings changes notation geometry.',
  'document-white-flattening': 'Optical document preprocessing flattens alpha to white before grayscale; this is input processing, independent of display/print themes.',
  'ink-interpolation-registration': '@property requires a computationally independent initial percentage; 108% is the completed ink-writing geometry.',
};
export const ruleVersions = {};
function cssLengths(value) {
  // Asset URLs and quoted font/content identities are not CSS dimensions.
  const syntax = value.replace(/url\((?:[^()'"]|'[^']*'|"[^"]*")*\)/gi, '').replace(/(['"])(?:\\.|(?!\1).)*?\1/g, '');
  return [...syntax.matchAll(/(?<![\w-])(-?(?:\d*\.)?\d+)(px|rem|em|ms|s|%|vh|vw|dvh|svh|vmax|ch|pt)(?![a-z])/g)].map(m=>m[0]).filter(v=>!/^[-+]?0(?:\.0+)?(?:px|rem|em|ms|s|%|vh|vw|dvh|svh|vmax|ch|pt)$/.test(v) && v!=='100%');
}
function namedTokens(value) {
  // Lex CSS identifiers, skipping balanced var()/url() arguments and quoted strings.
  // In particular --ds-red and animation identifiers are not the color token red.
  const words = []; let i = 0;
  while (i < value.length) {
    if (value[i] === '\"' || value[i] === "'") { const q = value[i++]; while (i < value.length) { if (value[i++] === '\\') i++; else if (value[i - 1] === q) break; } continue; }
    const word = value.slice(i).match(/^[a-z_-][a-z0-9_-]*/i);
    if (!word) { i++; continue; }
    const name = word[0]; i += name.length;
    if (/^(url|var)$/i.test(name) && value[i] === '(') {
      let depth = 1; i++;
      while (i < value.length && depth) { if (value[i] === '(') depth++; if (value[i] === ')') depth--; i++; }
    } else if (namedColors.has(name.toLowerCase())) words.push(name);
  }
  return words;
}
function tokenFont(value) {
  if (/^(?:inherit|initial)$/.test(value.trim())) return true;
  if (/^--value\(--type-\*\)$/.test(value.trim())) return true;
  const normalized = value.replace(/var\(\s*--[\w-]+(?:,\s*(?:inherit|initial))?\s*\)/g, 'TOKEN').replace(/(?:clamp|min|max|calc)\([^)]*\)/g, '1px').trim();
  return /^(?:(?:normal|italic|oblique|bold|[\d.]+(?:px|rem|em|%|pt)?)(?:\/[\d.]+(?:px|rem|em|%|pt)?)?\s+)*TOKEN$/.test(normalized);
}
const defaultFont = /(?:^|\s)tw:(?:[\w-]+:)*font-(?:sans|serif|thin|extralight|light|normal|medium|semibold|bold|extrabold|black)\b/g;
const sinkName = /(?:fillStyle|strokeStyle|shadowColor|color|background|backgroundColor|borderColor|outlineColor|font|fontFamily|cssText|boxShadow|innerHTML|outerHTML)$/;
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
export function scanDesignFile(file, source, options = {}) {
  const enforceNames = options.semanticNames ?? enforceSemanticNames;
  const tokenSource = allowed.has(file);
  const entries = [];
  const add = (kind, context, value) => entries.push({ file, kind, context: normalize(context), value: normalize(value) });
  function colors(text, context, names = false) {
    for (const match of text.matchAll(colorAtom)) add('raw-color', context, match[0]);
    // Literal channels in a template head, e.g. rgba(255,244,228,${alpha}),
    // are still pigments even though the alpha expression splits the string.
    for (const match of text.matchAll(/(?:rgba?|hsla?)\(\s*\d+(?:\.\d+)?%?\s*[, ]\s*\d+(?:\.\d+)?%?\s*[, ]\s*\d+(?:\.\d+)?%?[^)]*$/gi)) add('raw-template-channels', context, match[0]);
    if (names) {
      for (const word of namedTokens(text)) add('named-color', context, word);
    }
  }
  function semanticArbitrary(utility) {
    if (/(?:-(?:\((?:[a-z-]+:)?--ds-[\w-]+\)|\[(?:[a-z-]+:)?var\(--ds-[\w-]+\)\])|^\[[a-z-]+:var\(--ds-[\w-]+\)\])$/.test(utility)) return true;
    // Native cascade keywords select inheritance/structure, not authored design values.
    if (/^\[-?[a-z-]+:(?:inherit|revert|initial|unset|none)\]$/.test(utility)) return true;
    const variables = [...utility.matchAll(/(?:var\(\s*|[:(])(--[\w-]+)/g)].map(m=>m[1]);
    // Element-local voice paint, pointer tilt and writing progress/delays are runtime inputs.
    return variables.length > 0 && namedTokens(utility.replace(/_/g, ' ')).length === 0 && variables.every(v=>v.startsWith('--ds-') || ['--c','--rx','--ry','--written','--ded-delay','--ded-wait'].includes(v)) && !/(?:#[\da-f]{3,8}\b|\d+(?:px|rem|em|ms|s|deg|%)\b|rgba?\(|hsla?\()/i.test(utility);
  }
  function classes(text, context) {
    for (const match of text.matchAll(paletteClass)) add('palette-utility', context, match[0]);
    for (const word of text.match(/tw:[^\s\"'`]+/g) ?? []) {
      if (/data-(?:theme|type|design|ground)\s*[=\]]/.test(word)) add('legacy-theme-selector', context, word);
      if (/@media/.test(word) && /(?:width|height)[^)]*\d+(?:px|rem|em)\b/.test(word)) add('raw-media-query', context, word);
      // A variant's brackets can contain colons and nested attribute selectors.
      let depth = 0, lastColon = 2;
      for (let i = 3; i < word.length; i++) {
        if ('[('.includes(word[i])) depth++;
        if ('])'.includes(word[i])) depth--;
        if (word[i] === ':' && depth === 0) lastColon = i;
      }
      const utility = word.slice(lastColon + 1).replace(/!$/, '');
      if ((/-\[[^]*\]$|^-?\[[^]*\]$|^-?[\w-]+-\([^]*\)$/.test(utility)) && !semanticArbitrary(utility) && utility !== 'content-[attr(data-label)]') add('arbitrary-aesthetic', context, word);
      if (!mappedScale(utility)) add('unmapped-scale-utility', context, word);
      if (enforceNames && checkSemanticName(word)) add('value-encoding-name', context, word);
    }
    for (const match of text.matchAll(defaultFont)) add('default-font-utility', context, match[0]);
  }
  if (file.endsWith('.css')) {
    const tree = postcss.parse(source);
    tree.walkDecls(decl => {
      if (enforceNames && checkSemanticName(decl.prop)) add('value-encoding-name', decl.prop, decl.prop);
      if (tokenSource) {
        const themed = decl.parent.type === 'rule' && /data-theme\s*=/.test(decl.parent.selector);
        // Print is intentionally independent of the device appearance (D18).
        const fixedPrint = ['--ds-print-paper','--ds-print-ink'].includes(decl.prop);
        if (decl.prop.startsWith('--') && !decl.prop.startsWith('--pigment-') && !themed && !fixedPrint && (/(?:#[\da-f]{3,8}\b|(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch|color)\(|var\(\s*--pigment-)/i.test(decl.value) || namedColors.has(decl.value.trim()))) add('shared-screen-color', decl.prop, decl.value);
        return;
      }
      const ancestry = []; let node = decl.parent;
      while (node && node.type !== 'root') { ancestry.unshift(node.selector ?? `@${node.name} ${node.params ?? ''}`); node = node.parent; }
      const context = ancestry.join(' / ') + ' / ' + decl.prop;
      if (decl.parent.type === 'atrule' && decl.parent.name === 'font-face' && decl.prop === 'font-family' && assetFaces.has(decl.value.replace(/^['"]|['"]$/g, ''))) return;
      const registration = decl.parent.type === 'atrule' && decl.parent.name === 'property' && decl.parent.params === '--written' && decl.prop === 'initial-value' && decl.value === '108%';
      if (file.startsWith('src/design-system/') && !registration) for (const value of cssLengths(decl.value)) add('raw-css-dimension', context, value);
      colors(decl.value, context, !/^(?:font|font-family|animation-name|content)$/.test(decl.prop));
      if (/^(?:font|font-family)$/.test(decl.prop) && !tokenFont(decl.value) && !fontStack.test(decl.value)) add('font-allowlist', context, decl.value);
      fontStack.lastIndex = 0;
      if (/^(?:font|font-family)$/.test(decl.prop) && fontStack.test(decl.value)) add('raw-font', context, decl.value);
      fontStack.lastIndex = 0;
      if (/--pigment-/.test(decl.value)) add('primitive-import', context, decl.value);
    });
    tree.walkAtRules(rule => {
      if (rule.name === 'import' && !/\blayer\s*\(\s*[\w.-]+\s*\)/.test(rule.params)) add('unlayered-css-import', '@import', rule.params);
      if (['media', 'custom-variant'].includes(rule.name) && /(?:\b(?:width|height)\s*[:<>=][^)]*\d+(?:px|rem|em)\b|\d+(?:px|rem|em)\s*[<>=]+\s*(?:width|height)\b)/.test(rule.params)) add('raw-media-query', '@' + rule.name, rule.params);
      if (enforceNames && ['utility', 'custom-variant'].includes(rule.name) && checkSemanticName(rule.params.split(/[\s({]/)[0])) add('value-encoding-name', '@' + rule.name, rule.params);
    });
    tree.walkRules(rule => {
      if (/data-(?:design|ground)\s*[=\]]/.test(rule.selector) || (!tokenSource && /data-(?:theme|type)\s*[=\]]/.test(rule.selector))) add('legacy-theme-selector', rule.selector, rule.selector);
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
    // paper-noise-geometry: exclude only tuples directly in those three named noise fields.
    if (file === 'src/paper.ts' && ts.isArrayLiteralExpression(node) && ts.isArrayLiteralExpression(node.parent) && ts.isPropertyAssignment(node.parent.parent) && ['formation','flocs','tooth'].includes(node.parent.parent.name.getText(ast))) return result;
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
    function computed(n, seen = new Set()) {
      if (ts.isIdentifier(n) && declarations.has(n.text)) { if(!seen.has(n.text)) { const next = new Set([...seen,n.text]); computed(declarations.get(n.text), next); } return; }
      if (ts.isTemplateExpression(n) && /(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch|color)\(/i.test(n.head.text)) add('computed-color-at-sink', context(node), n.getText(ast));
      ts.forEachChild(n, child => computed(child, seen));
    }
    computed(node);
    for (const id of references(node)) if (declarations.has(id)) computed(declarations.get(id));
    for (const raw of rawChannels(node)) add('raw-channels-at-sink', context(node), raw);
    for (const id of references(node)) for (const raw of sources.get(id) ?? []) add('raw-channels-at-sink', context(node) + ' <- ' + id, raw);
  }
  const outsideSystem = !file.startsWith('src/design-system/');
  function fontFromTheme(node, seen = new Set()) {
    if (ts.isIdentifier(node) && declarations.has(node.text) && !seen.has(node.text)) { seen.add(node.text); return fontFromTheme(declarations.get(node.text), seen); }
    if (ts.isStringLiteralLike(node)) return tokenFont(node.text);
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) return /\.fonts(?:\.|\[)/.test(node.getText(ast));
    if (ts.isTemplateExpression(node)) {
      let hasFont = false;
      const skeleton = node.head.text + node.templateSpans.map(span => {
        const font = fontFromTheme(span.expression, new Set(seen));
        hasFont ||= font;
        return (font ? 'var(--snapshot-font)' : '1') + span.literal.text;
      }).join('');
      return hasFont && tokenFont(skeleton);
    }
    if (ts.isConditionalExpression(node)) return fontFromTheme(node.whenTrue, new Set(seen)) && fontFromTheme(node.whenFalse, new Set(seen));
    return false;
  }
  function literalValues(node, visit, seen = new Set()) {
    if (ts.isIdentifier(node) && declarations.has(node.text) && !seen.has(node.text)) { seen.add(node.text); literalValues(declarations.get(node.text), visit, seen); return; }
    if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) visit(node.text);
    ts.forEachChild(node, n => literalValues(n, visit, seen));
  }
  function checkVisual(node, font = false, cssText = false) {
    checkSink(node);
    if (font && !fontFromTheme(node)) {
      // Existing recognizable stacks retain their exact old raw-font entry.
      let legacy = false; literalValues(node, text => { fontStack.lastIndex = 0; if (fontStack.test(text)) legacy = true; }); fontStack.lastIndex = 0;
      if (!legacy) add('font-allowlist', context(node), node.getText(ast));
    }
    literalValues(node, text => {
      // Existing whole-color/style-attribute recognition already reports these.
      const alreadyNamed = namedColors.has(text.toLowerCase()) || /(?:fill|stroke|color|background(?:-color)?)\s*[:=]/i.test(text);
      if (alreadyNamed && !cssText) return;
      if (cssText) { try { postcss.parse(`x{${text}}`).walkDecls(d => { if (!alreadyNamed && !/^(?:font|font-family|animation-name|content)$/.test(d.prop)) for (const word of namedTokens(d.value)) add('named-color', context(node), word); if (/^(?:font|font-family)$/.test(d.prop) && !tokenFont(d.value)) add('font-allowlist', context(node), d.value); }); return; } catch { /* Template fragments still receive lexical checks. */ } }
      if (!font && !alreadyNamed) for (const word of namedTokens(text)) add('named-color', context(node), word);
    });
  }
  function dependency(node, specifier, typeOnly) {
    if (!specifier || !ts.isStringLiteralLike(specifier)) { add('recipe-boundary', 'dependency', specifier?.getText(ast) ?? 'dynamic'); return; }
    const path = specifier.text;
    const resolved = pathModule(path);
    const recipe = resolved.startsWith('src/design-system/recipes/') && (path.startsWith('./') || path.startsWith('../recipes/'));
    const tokens = typeOnly && /^src\/design-system\/(?:tokens|theme)(?:\.[cm]?[jt]s)?$/.test(resolved);
    if (!recipe && !tokens) add('recipe-boundary', 'dependency', path);
  }
  function pathModule(specifier) { return path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier)); }
  function visit(node) {
    if (ts.isTemplateExpression(node) && /hsla?\(/i.test(node.head.text) && /\d+(?:\.\d+)?%/.test(node.templateSpans.map(span => span.literal.text).join(''))) add('raw-hsl-template', context(node), node.getText(ast));
    if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      const text = node.text, owner = context(node);
      // safe-svg's exact expected renderer CSS is a protocol/security contract.
      // It stays visible in the immutable legacy ceiling; no file-wide exclusion.
      const protocol = file === 'src/safe-svg.ts' && createHash('sha256').update(text).digest('hex') === 'a2eac41dcdc8619d76a7fa20a204e3493f6db8670d9f659c9ad2f71f1622731c';
      const stemShape = file === 'src/staffView.ts' && text === 'black' && ts.isConditionalExpression(node.parent) && node.parent.condition.getText(ast) === 'shape.filled';
      const documentWhite = file === 'server/page-render.mjs' && text === '#ffffff' && ts.isPropertyAssignment(node.parent) && node.parent.name.getText(ast) === 'background' && node.parent.parent.parent?.expression?.getText(ast).endsWith('.flatten');
      if (!protocol && !stemShape && !documentWhite) colors(text, owner, namedColors.has(text.toLowerCase()) || /(?:fill|stroke|color|background(?:-color)?)\s*[:=]/i.test(text));
      if (fontStack.test(text)) add('raw-font', owner, text);
      fontStack.lastIndex = 0;
      classes(text, owner);
      if (/--pigment-/.test(text)) add('primitive-import', owner, text);
    }
    if (ts.isPropertyAssignment(node)) {
      const prop = node.name.getText(ast).replace(/^['"]|['"]$/g, '');
      if (sinkName.test(prop)) checkSink(node.initializer);
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const left = node.left.getText(ast), prop = ts.isElementAccessExpression(node.left) ? node.left.argumentExpression.text : left.split('.').at(-1);
      if (/\.style(?:\.|\[)/.test(left) || sinkName.test(prop ?? '')) checkVisual(node.right, /^(?:font|fontFamily)$/.test(prop ?? ''), prop === 'cssText');
    }
    if (outsideSystem && ts.isBinaryExpression(node) && [ts.SyntaxKind.LessThanToken, ts.SyntaxKind.LessThanEqualsToken, ts.SyntaxKind.GreaterThanToken, ts.SyntaxKind.GreaterThanEqualsToken].includes(node.operatorToken.kind) && [node.left, node.right].some(part => /^(?:(?:window|globalThis)\.)?inner(?:Width|Height)$/.test(part.getText(ast)))) add('raw-breakpoint-compare', context(node), node.getText(ast));
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const name = node.expression.name.text;
      if (name === 'getAttribute' && /^data-(?:theme|type|design|ground)$/.test(node.arguments[0]?.text ?? '') && !/^src\/design-system\/theme\//.test(file)) add('legacy-theme-read', context(node), node.getText(ast));
      if (name === 'addColorStop' && node.arguments[1]) checkVisual(node.arguments[1]);
      if (['setAttribute', 'setProperty'].includes(name) && node.arguments[0] && node.arguments[1]) {
        const prop = node.arguments[0].text ?? '';
        if (name === 'setProperty' || /^(?:fill|stroke|style|color|font-family)$/.test(prop)) checkVisual(node.arguments[1], /^(?:font|font-family)$/.test(prop), prop === 'style');
      }
      if (outsideSystem && name === 'getPropertyValue' && /^--/.test(node.arguments[0]?.text ?? '')) add('computed-style-token-read', context(node), node.getText(ast));
    }
    if (outsideSystem && ts.isCallExpression(node) && /(?:^|\.)matchMedia$/.test(node.expression.getText(ast))) {
      literalValues(node.arguments[0] ?? node, text => { if (/(?:width|height)\s*[:<>=]/.test(text)) add('raw-media-query', context(node), text); });
    }
    if (outsideSystem && ts.isPropertyAccessExpression(node) && /\.dataset\.(?:theme|design|ground)$/.test(node.getText(ast))) add('legacy-theme-read', context(node), node.getText(ast));
    const importNode = ts.isImportDeclaration(node) || ts.isExportDeclaration(node);
    const dynamicImport = ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword;
    const specifier = importNode ? node.moduleSpecifier : dynamicImport ? node.arguments[0] : undefined;
    if (specifier && /\.css(?:\?|$)/.test(specifier.text ?? '') && file !== 'src/design-system/app.css') {
      // Root's ?url eager link is the sole TS boundary; side-effect CSS imports bypass layers.
      if (!(file === 'src/routes/__root.tsx' && specifier.text === '../design-system/app.css?url')) add('unlayered-css-import', 'import', specifier.text);
    }
    if (/^src\/design-system\/recipes(?:\/|\.ts)/.test(file) && (importNode || dynamicImport)) {
      const clause = ts.isImportDeclaration(node) ? node.importClause : undefined;
      const bindings = clause?.namedBindings;
      const typeOnly = ts.isExportDeclaration(node) ? (node.isTypeOnly || !!node.exportClause && ts.isNamedExports(node.exportClause) && node.exportClause.elements.every(e => e.isTypeOnly)) : !!clause && (clause.isTypeOnly || !!bindings && ts.isNamedImports(bindings) && !clause.name && bindings.elements.length > 0 && bindings.elements.every(e => e.isTypeOnly));
      if (specifier || dynamicImport) dependency(node, specifier, typeOnly);
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
export function checkBaseline(actual, baseline) {
  return [
    ...baseline.map(row => `NONEMPTY baseline is forbidden: ${key(row)}`),
    ...actual.map(row => `NEW ${key(row)} (${row.count ?? 1} occurrences)`),
  ];
}
/** The migration is complete; neither CLI switches nor new rule versions can revive a baseline. */
export function mergeNewRules() { throw Error('Non-empty baselines are forbidden; fix violations at their source.'); }
export function checkGrowth(baseline) { return baseline.entries.map(row => `NONEMPTY baseline is forbidden: ${key(row)}`); }
function main() {
  if (process.argv.includes('--initialize-baseline') || process.argv.includes('--merge-new-rules')) throw Error('Baseline migration is retired; the baseline must remain empty.');
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  const actual = observations(file => fs.readFileSync(path.join(root, file), 'utf8'), files());
  const errors = checkBaseline(actual, baseline.entries);
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log('Design token guard passed: 0 baseline entries; zero violations.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
