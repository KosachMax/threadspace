import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import { messages, type Language } from "./messages";

export function normalizeLanguage(language:string):Language {
  return /^ru(?:[-_]|$)/i.test(language.trim())?"ru":"en";
}
export function interfaceLanguage():Language {
  return normalizeLanguage(typeof document!=="undefined"?(document.documentElement.lang.trim()||navigator.language):"en");
}
function subscribe(listener:()=>void){
  const observer=new MutationObserver(listener);
  observer.observe(document.documentElement,{attributes:true,attributeFilter:["lang"]});
  window.addEventListener("languagechange",listener);
  return ()=>{observer.disconnect();window.removeEventListener("languagechange",listener);};
}
const LanguageContext=createContext<Language>("en");
export const useInterfaceLanguage=()=>useSyncExternalStore<Language>(subscribe,interfaceLanguage,()=>"en");
export function InterfaceLanguageProvider({children}:{children:ReactNode}) {
  const language=useInterfaceLanguage();
  return <LanguageContext.Provider value={language}>{children}</LanguageContext.Provider>;
}
export const useLanguage=()=>useContext(LanguageContext);
export const useStrings=()=>messages[useLanguage()];
