// Unicode CLDR names/keywords, filtered to the exact emoji set shipped by this plugin.
import { readFile,writeFile,mkdir } from "node:fs/promises";
async function get(url,json=true){const response=await fetch(url);if(!response.ok)throw new Error(`${response.status}: ${url}`);return json?response.json():response.text();}
const {sha}=await get("https://api.github.com/repos/unicode-org/cldr-json/commits/main");
const root=`https://raw.githubusercontent.com/unicode-org/cldr-json/${sha}`;
const main=await get(`${root}/cldr-json/cldr-annotations-full/annotations/ru/annotations.json`);
const derived=await get(`${root}/cldr-json/cldr-annotations-derived-full/annotationsDerived/ru/annotations.json`);
const normalize=value=>value.replace(/\uFE0F/g,"");
const source=Object.fromEntries(Object.entries({...main.annotations.annotations,...derived.annotationsDerived.annotations}).map(([key,value])=>[normalize(key),value]));
const data=JSON.parse(await readFile("node_modules/@emoji-mart/data/sets/15/native.json","utf8"));
const localized={};
for(const emoji of Object.values(data.emojis)){
  const key=normalize(emoji.skins[0].native),annotation=source[key];
  if(annotation?.tts?.[0])localized[key]={name:annotation.tts[0],keywords:annotation.default||[]};
}
await writeFile("src/emoji-ru.json",JSON.stringify(localized)+"\n");
await mkdir("licenses",{recursive:true});
const license=await get(`${root}/LICENSE`,false);
await writeFile("licenses/UNICODE-CLDR.txt",`Russian emoji names and keywords in src/emoji-ru.json.\nSource: ${root}\n\n${license}`);
process.stdout.write(JSON.stringify({commit:sha,translated:Object.keys(localized).length,total:Object.keys(data.emojis).length})+"\n");
