import {spawnSync} from 'node:child_process';
import fs from 'node:fs/promises';
const journal=JSON.parse(await fs.readFile('drizzle/meta/_journal.json','utf8'));
for(const entry of journal.entries){await fs.access(`drizzle/${entry.tag}.sql`)}
if(!await fs.stat('dist/server/index.js').catch(()=>null))throw Error('缺少 dist/server/index.js，请先运行 npm run build');
// Production discovers schema migrations at the archive root.
const target=process.argv[2]||'class-site-worker.tar.gz';
const result=spawnSync('tar',['-czf',target,'dist','drizzle'],{stdio:'inherit'});
if(result.status)process.exit(result.status);
console.log(`Packaged Worker and ${journal.entries.length} schema migration(s) into ${target}.`);
