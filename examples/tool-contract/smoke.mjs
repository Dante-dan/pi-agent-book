// 直接调用真实 Pi 工具；不调用模型，不加载用户配置。
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createReadTool, createWriteTool, createEditTool } from '@earendil-works/pi-coding-agent';
const dir = mkdtempSync(join(tmpdir(), 'pi-book-tools-'));
try {
 const write = createWriteTool(dir), read = createReadTool(dir), edit = createEditTool(dir);
 const original = '价格是 $5；示例表达式为 `name`。\n第二行\n';
 await write.execute('write-1', { path: 'literal.txt', content: original });
 assert.equal(readFileSync(join(dir,'literal.txt'),'utf8'),original);
 const slice = await read.execute('read-1', { path: 'literal.txt', offset: 2, limit: 1 });
 assert.match(slice.content[0].text, /第二行/);
 await edit.execute('edit-1', {path:'literal.txt',edits:[{oldText:'第二行',newText:'修改后的第二行'}]});
 assert.equal(readFileSync(join(dir,'literal.txt'),'utf8'), original.replace('第二行','修改后的第二行'));
 writeFileSync(join(dir,'long.txt'),Array.from({length:2005},(_,i)=>`line ${i+1}`).join('\n'));
 const truncated=await read.execute('read-2',{path:'long.txt'});
 assert.match(truncated.content[0].text,/offset=2001/);
 assert.match(truncated.content[0].text,/2005/);
 console.log('PASS: literal write, line slice, edits[] replacement, 2000-line truncation notice');
} finally {rmSync(dir,{recursive:true,force:true});}
