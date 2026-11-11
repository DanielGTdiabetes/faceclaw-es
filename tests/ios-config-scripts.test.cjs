const test = require('node:test');
const { execFileSync } = require('node:child_process');
test('iOS config codec preserves Android XML and JSON types and rejects malformed imports', () => {
  execFileSync(process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), ['-c', `
import json, os, pathlib, sys, tempfile, xml.etree.ElementTree as ET
sys.path.insert(0, 'scripts')
from config_document import read_document
from ios_config import atomic_write
values = {'terminal.connections': '[{"url":"g2mirror://test@host"}]', 'flag': True, 'empty': '', 'number': 42, 'ratio': 0.25, 'unicode': 'π & < 🔋\\nnext'}
with tempfile.TemporaryDirectory() as d:
 p = pathlib.Path(d) / 'settings'
 root = ET.Element('map')
 for key, value in values.items():
  tag = 'boolean' if isinstance(value, bool) else 'int' if isinstance(value, int) else 'float' if isinstance(value, float) else 'string'
  node = ET.SubElement(root, tag, name=key)
  if tag == 'string': node.text = value
  else: node.set('value', str(value).lower())
 for data in [json.dumps({'schema': 1, 'settings': values}).encode(), ET.tostring(root, encoding='utf-8')]:
  atomic_write(p, data)
  assert json.loads(read_document(p))['settings'] == values
  if os.name != 'nt': assert p.stat().st_mode & 0o777 == 0o600
 for invalid in [b'{}', b'<map><set name="x"/></map>', b'<map><boolean name="x" value="maybe"/></map>', b'<map><string name="x">a</string><string name="x">b</string></map>', b'{"schema":1,"settings":{"x":null}}', b'{"schema":1,"settings":{"x":NaN}}', b'<map><string name="x">oops']:
  p.write_bytes(invalid)
  try: read_document(p)
  except (ValueError, ET.ParseError): pass
  else: raise AssertionError('accepted invalid config')
`], { stdio: 'inherit' });
});
