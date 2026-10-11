/** Extract complete JSON array elements only. Never used for full catalogue downloads. */
export function portalArrayPrefix(text: string, limit = 128): any[] | null {
  // Only protocol envelopes may be sampled. An error/HTML/string containing
  // a random "data" array must never be converted into a successful js response.
  const match=/^\s*\{\s*"js"\s*:\s*(?:\[|\{\s*(?:"(?:total_items|max_page_items|cur_page|total|total_pages)"\s*:\s*\d+\s*,\s*)*"data"\s*:\s*\[)/.exec(text);
  if(!match)return null;
  // A complete error envelope remains an error, even if it also contains data.
  try { const whole=JSON.parse(text); if(whole?.error || whole?.js?.error || whole?.success===false || whole?.js?.success===false)return null; } catch {}
  const start=match.index+match[0].lastIndexOf('[')+1;
  let depth=0,quoted=false,escaped=false,itemStart=start;const rows:any[]=[];
  for(let i=start;i<text.length;i++) {
    const ch=text[i];
    if(quoted){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch==='"')quoted=false;continue;}
    if(ch==='"'){quoted=true;continue;}
    if((ch===','||ch===']')&&depth===0){const item=text.slice(itemStart,i).trim();if(item){try{rows.push(JSON.parse(item));}catch{return null;}}else if(ch===',' || rows.length)return null;itemStart=i+1;if(rows.length>=limit)return rows;if(ch===']'){try{const whole=JSON.parse(text);const complete=Array.isArray(whole?.js)?whole.js:whole?.js?.data;return Array.isArray(complete)?complete:null;}catch{return null;}}continue;}
    if(ch==='{'||ch==='[')depth++;else if(ch==='}'||ch===']')depth--;
  }
  return null;
}
export async function boundedPortalText(response:any,maxBytes?:number,sampleArray=false):Promise<string> {
  if(!maxBytes)return response.text();
  const tooLarge=()=>Object.assign(new Error('Yanıt güvenli örnek sınırını aştı.'),{kind:'RESPONSE_TOO_LARGE'});
  const reader=response.body?.getReader?.();
  if(!reader){const text=await response.text();let bytes=0;for(let i=0;i<text.length;i++){const cp=text.codePointAt(i)!;bytes+=cp<128?1:cp<2048?2:cp<65536?3:4;if(cp>65535)i++;if(bytes>maxBytes)throw tooLarge();}return text;}
  let bytes=0,text='';const decoder=typeof TextDecoder==='undefined'?undefined:new TextDecoder();let carry=new Uint8Array(0);
  const decode=(input?:Uint8Array,stream=false)=>{
    if(decoder)return decoder.decode(input,{stream});
    const joined=new Uint8Array(carry.length+(input?.length||0));joined.set(carry);if(input)joined.set(input,carry.length);
    let cut=joined.length;
    if(stream){for(let i=Math.max(0,joined.length-4);i<joined.length;i++){const b=joined[i];const n=b>=240?4:b>=224?3:b>=192?2:1;if(b>=192&&i+n>joined.length){cut=i;break;}}}
    carry=joined.slice(cut);let encoded='';for(let i=0;i<cut;i++)encoded+='%'+joined[i].toString(16).padStart(2,'0');
    try{return decodeURIComponent(encoded);}catch{throw Object.assign(new Error('Portal yanıtı UTF-8 değil.'),{kind:'INVALID_JSON'});}
  };
  try {
    while(true){const part=await reader.read();if(part.done){text+=decode();return text;}
      const remaining=maxBytes-bytes;
      const chunk=part.value.byteLength>remaining?part.value.subarray(0,remaining):part.value;
      bytes+=part.value.byteLength;text+=decode(chunk,true);
      if(sampleArray){const rows=portalArrayPrefix(text);if(rows?.length)return JSON.stringify({js:rows});}
      if(bytes>maxBytes)throw tooLarge();
    }
  } finally {try{await reader.cancel();}catch{}try{reader.releaseLock();}catch{}}
}
