import { playerPartRecipe, type PlayerPart } from "../recipes";
import { createButton, createIconButton, createInput, type Attributes } from "./index";
/** Named domain slots keep main.ts free of appearance classes. */
export function createPlayerPart<K extends keyof HTMLElementTagNameMap>(tag:K, part:PlayerPart, options:{attrs?:Attributes;text?:string}={}) {
 const el=document.createElement(tag);el.className=playerPartRecipe(part);
 if(options.text!==undefined)el.textContent=options.text;
 for(const [key,value] of Object.entries(options.attrs??{})) {
  if(key==="class"||key==="style"||key.startsWith("on"))throw Error("Use named player slots");
  if(value!==undefined)el.setAttribute(key,String(value));
 }
 return el;
}
export function createVoiceRow(options:{partId:string;name:string;color:string;onlyHint:string;muteLabel:string;soloLabel:string;moreLabel?:string;moreIcon?:Node}) {
 const row=createPlayerPart("li","voice-row",{attrs:{"data-part":options.partId}});
 row.style.setProperty("--c",options.color);
 const light=createPlayerPart("i","light",{attrs:{"data-part":options.partId,"aria-hidden":true}});
 const name=createButton({text:options.name,variant:options.name.length>13?"player-voice-name-long":"player-voice-name",attrs:{title:options.onlyHint}});
 row.append(light,name);
 for(const [mix,text,label,variant] of [["muted","M",options.muteLabel,"player-mute"],["solo","S",options.soloLabel,"player-solo"]] as const)
  row.append(createButton({text,variant,pressed:false,attrs:{"data-mix":mix,"aria-label":label,title:label}}));
 if(options.moreLabel)row.append(createIconButton({variant:"voice-more",label:options.moreLabel,icon:options.moreIcon,attrs:{title:options.moreLabel}}));
 return row;
}
export function createVoiceChip(options:{partId:string;name:string;color:string;title:string}) {
 const chip=createButton({text:"",variant:"player-chip",attrs:{"data-part":options.partId,title:options.title}});
 chip.style.setProperty("--c",options.color);
 const dot=document.createElement("i");dot.setAttribute("aria-hidden","true");
 chip.append(dot,document.createTextNode(options.name));return chip;
}
export function createMixerVolume(options:{id:string;label:string}) {
 const duck=createPlayerPart("div","duck"),label=createPlayerPart("label","label",{text:options.label,attrs:{for:options.id}}),row=createPlayerPart("div","duck-row");
 row.append(createInput({variant:"player-volume",type:"range",id:options.id,attrs:{min:0,max:0.75,step:0.05}}),createPlayerPart("output","duck-value"));
 duck.append(label,row);return duck;
}
/** SMuFL is trusted text, never interpreted markup. */
export function createPlayerGlyph(text:string,kind:string) {
 const glyph=document.createElement("span");glyph.className="ds-player-glyph menu-glyph "+kind;glyph.textContent=text;glyph.setAttribute("aria-hidden","true");return glyph;
}
/** Desktop and phone share commands; only the named slots choose their layout. */
export function createTransport(options:{position:Node;commands:Iterable<Node>;controls:Iterable<Node>}) {
 const transport=createPlayerPart("footer","transport"),center=createPlayerPart("div","transport-center"),right=createPlayerPart("div","transport-right");
 center.append(...options.commands);right.append(...options.controls);transport.append(options.position,center,right);return transport;
}
