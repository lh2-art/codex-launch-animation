'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Model = require('../settings-model.js');

function createStore(directory = process.env.CODEX_LAUNCHER_TEST_DATA || path.join(process.env.APPDATA, 'codex-launcher')) {
  const filename = path.join(directory, 'settings.json');
  const read = () => {
    try { return Model.normalize(JSON.parse(fs.readFileSync(filename, 'utf8'))); }
    catch (error) { if (error.code === 'ENOENT') return Model.normalize(); throw error; }
  };
  const update = (patch) => {
    const settings = Model.merge(read(), patch);
    fs.mkdirSync(directory, { recursive: true });
    const temporary = path.join(directory, `plugin-${process.pid}-${crypto.randomUUID()}.tmp`);
    try { fs.writeFileSync(temporary, JSON.stringify(settings, null, 2)); fs.renameSync(temporary, filename); }
    finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
    return settings;
  };
  return { read, update };
}
module.exports = { createStore };
