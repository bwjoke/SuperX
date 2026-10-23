// Terminal-only entry point: no extension APIs or browser required.
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const Core=require('../extension/feed-core.js');
const DeepSeek=require('../extension/deepseek-provider.js');
const args=process.argv.slice(2);
function option(name,fallback){const i=args.indexOf(name);return i<0?fallback:args[i+1];}
if(args.includes('--help')||!args.length){
  console.log(`Usage:
  node tools/fact-check.mjs --url https://x.com/user/status/123
  node tools/fact-check.mjs --text "A claim to check" --no-x

Options:
  --key-file PATH  Read a DeepSeek key from a local text file
                  (otherwise use DEEPSEEK_API_KEY)
  --model ID       deepseek-flash (default) or deepseek-v4-pro
  --effort LEVEL   none (default), low, medium (maps to high), high, max
  --port NUMBER    Local Twikit bridge port (default: 2420)
  --no-x           Disable Twikit (useful for text-only input)
  --no-web         Disable DeepSeek web search
  --language CODE  Answer language (default: zh-CN)

This calls paid DeepSeek APIs; credentials and cookies are not printed.`);
  process.exit(0);
}
try {
  const keyFile=option('--key-file');
  const key=keyFile?(await readFile(keyFile,'utf8')).trim():process.env.DEEPSEEK_API_KEY;
  if(!key)throw new Error('Set DEEPSEEK_API_KEY or pass --key-file PATH.');
  const url=option('--url'),text=option('--text');
  if(Boolean(url)===Boolean(text))throw new Error('Provide exactly one of --url or --text.');
  if(url&&!Core.canonicalPostUrl(url))throw new Error('Provide a valid X post URL.');
  const model=option('--model','deepseek-flash');
  if(!['deepseek-flash','deepseek-v4-pro'].includes(model))throw new Error('Unsupported DeepSeek model.');
  const effort=option('--effort','none');
  if(!['none','low','medium','high','max'].includes(effort))throw new Error('Unsupported DeepSeek reasoning effort.');
  const port=Number(option('--port','2420'));
  if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid Twikit port.');
  const settings=Core.normalizeSettings({...Core.DEFAULT_SETTINGS,provider:'api',apiBackend:'deepseek',deepseekXSource:'twikit',deepseekModel:model,deepseekReasoningEffort:effort,twikitPort:port,xSearch:!args.includes('--no-x'),webSearch:!args.includes('--no-web'),language:option('--language','zh-CN')});
  const post=url?{url:Core.canonicalPostUrl(url),text:'',id:url.match(/status\/(\d+)/)[1]}:{kind:'draft',mode:'post',text};
  const controller=new AbortController();
  const cancel=()=>controller.abort();
  process.once('SIGINT',cancel);
  let printed=0;
  try {
    const result=await DeepSeek.run(post,settings,key,{signal:controller.signal,onUpdate:update=>{
      if(update.text?.length>printed){process.stdout.write(update.text.slice(printed));printed=update.text.length;}
    }});
    process.stdout.write('\n');
    if(result.warning)process.stderr.write(result.warning+'\n');
    process.stderr.write(`Status: ${result.verificationStatus}; model tokens: ${result.usage.total_tokens??'unknown'} (search charges are separate)\n`);
  }finally{process.removeListener('SIGINT',cancel);}
}catch(error){
  console.error(error.name==='AbortError'?'Cancelled.':error.message);
  process.exitCode=1;
}
