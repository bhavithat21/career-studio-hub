import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
export async function loadAdapterModules(){
 const urls={};for(const name of ['catalog','matching'])urls[name]=new URL('../lib/'+name+'.ts',import.meta.url).href;
 const modules={};for(const name of ['portal-adapters','more-portals','employer-adapters','rolling-portals','ats-adapters','linkedin-adapter','adapters']){let source=await readFile(new URL('../lib/'+name+'.ts',import.meta.url),'utf8');for(const [key,url] of Object.entries(urls))source=source.replaceAll("'./"+key+"'",JSON.stringify(url));urls[name]='data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64');modules[name]=await import(urls[name]);}return modules;
}
