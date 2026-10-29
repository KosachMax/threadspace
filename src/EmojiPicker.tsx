import { useMemo, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import emojiData from "@emoji-mart/data/sets/15/native.json";
import type { Emoji } from "@emoji-mart/data";
import russianNames from "./emoji-ru.json";
import { useLanguage, useStrings } from "./i18n";
const russian:Record<string,{name:string;keywords:string[]}>=russianNames;
const normalized=(emoji:Emoji)=>emoji.skins[0].native.replace(/\uFE0F/g,"");
import { Icon } from "./icons";
import { colorNames, isEmoji, type ProjectAppearance } from "./preferences";
import { CompactSheet } from "./CompactSheet";

const frequent = ["file_folder", "open_file_folder", "card_index_dividers", "books", "book", "memo", "rocket", "bulb", "art", "computer", "gear", "hammer_and_wrench", "jigsaw", "seedling", "herb", "deciduous_tree", "house", "house_with_garden", "coffee", "tea", "sparkles", "star", "zap", "fire", "target", "dart", "pushpin", "paperclip", "link", "package", "briefcase", "bar_chart", "chart_with_upwards_trend", "calendar", "white_check_mark", "heavy_check_mark", "heart", "purple_heart", "blue_heart", "green_heart", "orange_heart", "yellow_heart", "brain", "speech_balloon", "thought_balloon", "robot_face", "cat", "dog", "fox_face", "panda_face", "octopus", "whale", "butterfly", "sunflower", "tulip", "cherry_blossom", "potted_plant", "cactus", "globe_with_meridians", "earth_africa", "rainbow", "sunny", "crescent_moon", "gem", "crystal_ball", "test_tube", "microscope", "telescope", "satellite", "airplane", "sailboat", "mountain", "beach_with_umbrella", "ocean", "musical_note", "headphones", "camera", "movie_camera", "video_game", "chess_pawn", "medal", "trophy"];
const ruKeywords: Record<string, string> = { папка:"folder", книга:"book", дом:"house", кот:"cat", кошка:"cat", собака:"dog", лиса:"fox", идея:"bulb", ракета:"rocket", работа:"briefcase", цветок:"flower", сердце:"heart", звезда:"star", огонь:"fire", робот:"robot", код:"computer", компьютер:"computer", кофе:"coffee", дерево:"tree", растение:"plant", солнце:"sun", луна:"moon", музыка:"music", заметка:"memo", галочка:"check", проект:"folder", мозг:"brain", цель:"dart", шар:"ball", природа:"leaf" };

export function EmojiPicker({ name, value, theme, compact = false, menuTrigger = false, onChange }: { name: string; value: ProjectAppearance; theme: "light" | "dark"; compact?: boolean; menuTrigger?: boolean; onChange(patch: Partial<ProjectAppearance>): Promise<void> }) {
  const language=useLanguage(),t=useStrings();
  const emojiName=(emoji:Emoji)=>{const name=language==="ru"?(russian[normalized(emoji)]?.name||emoji.name):emoji.name;return name[0].toLocaleUpperCase(language)+name.slice(1);};
  const [open,setOpen]=useState(false), [category,setCategory]=useState("frequent"), [query,setQuery]=useState(""), [custom,setCustom]=useState(""), [error,setError]=useState<"saveError"|"oneEmoji"|null>(null), [saving,setSaving]=useState(false);
  const emojis=useMemo(()=>{
    if(!open)return [];
    const q=query.trim().toLowerCase(), needle=ruKeywords[q]||q;
    if(q)return Object.values(emojiData.emojis).filter(e=>`${e.id} ${e.name} ${e.keywords.join(" ")} ${e.skins[0].native} ${russian[normalized(e)]?.name||""} ${russian[normalized(e)]?.keywords.join(" ")||""}`.toLowerCase().includes(needle)).slice(0,180);
    const ids=category==="frequent"?frequent:emojiData.categories.find(c=>c.id===category)?.emojis||[];
    return ids.map(id=>emojiData.emojis[id]).filter(Boolean);
  },[open,category,query]);
  async function save(patch: Partial<ProjectAppearance>) {
    setSaving(true);setError(null);
    try { await onChange(patch);setOpen(false); } catch { setError("saveError"); } finally {setSaving(false);}
  }
  function changeOpen(next: boolean) {
    setOpen(next);
    if(next){setQuery("");setCustom("");setError(null);}
  }
  const trigger=menuTrigger?<button type="button" className="ns-icon-button ns-project-menu" aria-label={t.projectMenu(name)} title={t.projectMenu(name)}><Icon name="dots"/></button>:<button type="button" className="ns-project-emoji" aria-label={t.projectEmoji(name)} title={t.changeEmoji} data-color={value.color} {...(compact?{"aria-haspopup":"dialog" as const,"aria-expanded":open,onClick:()=>changeOpen(true)}:{})}>{value.emoji?<span className="ns-emoji">{value.emoji}</span>:<Icon name="folder"/>}</button>;
  const content=open&&<>
      <div className="ns-picker-head"><span>{t.color}</span>{!compact&&<Popover.Close className="ns-icon-button" aria-label={t.closeEmoji}><Icon name="close"/></Popover.Close>}</div>
      <div className="ns-color-row" role="group" aria-label={t.color}>{colorNames.map(color=><button key={color} data-color={color} className="ns-color-swatch" disabled={saving} aria-label={t.colors[color]} title={t.colors[color]} aria-pressed={color===value.color} onClick={()=>void save({color})}>A</button>)}</div>
      <div className="ns-picker-head"><span>{t.emoji}</span></div>
      <label className="ns-picker-search"><Icon name="search"/><input aria-label={t.findEmoji} placeholder={t.searchEmoji} value={query} onChange={e=>setQuery(e.target.value)}/></label>
      <div className="ns-emoji-categories"><select aria-label={t.emojiCategory} value={category} onChange={e=>{setCategory(e.target.value);setQuery("");}}>{Object.entries(t.categories).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select><button className="ns-icon-button" title={t.randomEmoji} aria-label={t.randomEmoji} disabled={saving} onClick={()=>{const list=Object.values(emojiData.emojis);void save({emoji:list[Math.floor(Math.random()*list.length)].skins[0].native});}}><Icon name="random"/></button></div>
      <div className="ns-emoji-grid" aria-label={t.emoji}>{emojis.map(e=><button key={e.id} disabled={saving} title={emojiName(e)} aria-label={emojiName(e)} aria-pressed={value.emoji===e.skins[0].native} onClick={()=>void save({emoji:e.skins[0].native})}>{e.skins[0].native}</button>)}{!emojis.length&&<p className="ns-empty">{t.nothingFound}</p>}</div>
      <form className="ns-custom-emoji" onSubmit={e=>{e.preventDefault();if(!isEmoji(custom.trim())){setError("oneEmoji");return;}void save({emoji:custom.trim()});}}><label><span>{t.customEmoji}</span><input aria-label={t.customEmoji} placeholder={t.pasteEmoji} value={custom} maxLength={32} onChange={e=>{setCustom(e.target.value);setError(null);}}/></label><button type="submit" className="ns-text-button" disabled={saving}>{t.apply}</button></form>
      {error&&<p className="ns-error" role="alert">{t[error]}</p>}
      <div className="ns-picker-footer"><button className="ns-text-button" disabled={saving} onClick={()=>void save({emoji:null})}>{saving?t.saving:t.removeEmoji}</button><button className="ns-text-button" disabled={saving||value.color==="default"} onClick={()=>void save({color:"default"})}>{t.resetColor}</button></div>
  </>;
  if(compact)return <>
    {trigger}
    <CompactSheet open={open} onOpenChange={changeOpen} title={t.projectIcon(name)} theme={theme} className="ns-emoji-sheet">
      <div className="ns-picker ns-surface" data-theme={theme} data-compact="true" lang={language}>{content}</div>
    </CompactSheet>
  </>;
  return <Popover.Root open={open} onOpenChange={changeOpen}>
    <Popover.Trigger asChild>{trigger}</Popover.Trigger>
    {open&&<Popover.Portal><Popover.Content className="ns-picker ns-surface" data-theme={theme} lang={language} side="right" align="start" sideOffset={8} collisionPadding={10} aria-label={t.projectIcon(name)}>
      {content}
    </Popover.Content></Popover.Portal>}
  </Popover.Root>;
}
