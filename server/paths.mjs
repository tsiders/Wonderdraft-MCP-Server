import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';

export class MapPaths {
  constructor(roots) { this.roots = roots.map(p => path.resolve(p)); }
  async check(file, output = false) {
    if (!path.isAbsolute(file)) throw new Error('Map paths must be absolute.');
    if (path.extname(file).toLowerCase() !== '.wonderdraft_map') throw new Error('Expected a .wonderdraft_map file.');
    const resolved = output ? path.join(await realpath(path.dirname(file)), path.basename(file)) : await realpath(file);
    const roots = await Promise.all(this.roots.map(p => realpath(p)));
    if (!roots.some(root => {const rel = path.relative(root, resolved); return rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);}))
      throw new Error('Map path is outside configured roots.');
    if (!output && !(await stat(resolved)).isFile()) throw new Error('Map path must be a file.');
    if (output) {
      try { await stat(resolved); } catch (e) { if (e.code === 'ENOENT') return resolved; throw e; }
      throw new Error('Output already exists; choose a new filename.');
    }
    return resolved;
  }
}
