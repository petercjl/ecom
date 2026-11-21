import {spawnSync} from 'node:child_process';

// Chromium exposes the character count even when the secure field value is
// hidden. The observer returns only presence and never requests AXValue.
const probe = String.raw`
ObjC.import('ApplicationServices');
ObjC.bindFunction('AXUIElementCreateApplication', ['id', ['int']]);
ObjC.bindFunction('AXUIElementCopyAttributeValue', ['int', ['id', 'id', 'id*']]);
ObjC.bindFunction('AXUIElementCopyElementAtPosition', ['int', ['id', 'float', 'float', 'id*']]);
ObjC.bindFunction('CFEqual', ['bool', ['id', 'id']]);

function attribute(element, name) {
  const out = Ref();
  return $.AXUIElementCopyAttributeValue(element, $(name), out) === 0 ? out[0] : null;
}

function run(args) {
  const app = $.AXUIElementCreateApplication(Number(args[0]));
  const focused = attribute(app, 'AXFocusedWindow');
  const title = focused && ObjC.unwrap(attribute(focused, 'AXTitle'));
  if (typeof title !== 'string') return 'unknown';
  const normalize = name => name.replace(/ - Ecom(?: Dev)?$/, '');
  const expected = normalize(args[1]);
  const current = normalize(title);
  const fragments = expected.split('…');
  if (current !== expected && !(fragments.length === 2 && fragments[0] && fragments[1] &&
      current.startsWith(fragments[0]) && current.endsWith(fragments[1]))) return 'unknown';
  const hit = Ref();
  if ($.AXUIElementCopyElementAtPosition(app, Number(args[2]), Number(args[3]), hit) !== 0) return 'unknown';
  const field = hit[0];
  if (!field || ObjC.unwrap(attribute(field, 'AXSubrole')) !== 'AXSecureTextField') return 'unknown';
  const owner = attribute(field, 'AXWindow');
  if (!owner || !$.CFEqual(owner, focused)) return 'unknown';
  const count = ObjC.unwrap(attribute(field, 'AXNumberOfCharacters'));
  return Number.isInteger(count) && count >= 0 ? (count > 0 ? 'filled' : 'empty') : 'unknown';
}
`;

export function observeSecurePrefill(window, point, platform = process.platform) {
  if (platform !== 'darwin' || !window.is_focused || !point) return 'unknown';
  const result = spawnSync('/usr/bin/osascript', ['-l', 'JavaScript', '-',
    String(window.pid), window.title, ...point.map(String)], {input: probe, encoding: 'utf8', timeout: 3000});
  const status = result.status === 0 ? result.stdout.trim() : null;
  return ['filled', 'empty'].includes(status) ? status : 'unknown';
}
