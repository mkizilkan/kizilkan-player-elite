import type { DiagnosticEvent } from './diagnostics';

/** Always fed the final redacted V7 JSON projection, never raw account/archive data. */
export type DiagnosticReportFormat='json'|'md'|'csv';
export type CanonicalDiagnosticReport={schema?:string;appVersion?:string;generatedAt?:string;events:DiagnosticEvent[];critical?:DiagnosticEvent[];writerHealth?:Record<string,unknown>;[key:string]:unknown};
const cell=(value:unknown)=>{
  let text=String(value??'');
  // Prevent spreadsheet formula execution, including whitespace/control prefixes.
  if(/^[\s\u0000-\u001f]*[=+@-]/.test(text))text="'"+text;
  return '"'+text.replace(/"/g,'""')+'"';
};
const md=(value:unknown)=>String(value??'').replace(/[\r\n]+/g,' ').replace(/\|/g,'\\|').replace(/</g,'&lt;').replace(/>/g,'&gt;');
export function renderDiagnosticReport(report:CanonicalDiagnosticReport,format:DiagnosticReportFormat):string{
  if(format==='json')return JSON.stringify(report,null,2);
  const events=[...new Map([...report.events,...(report.critical||[])].map(e=>[e.id||[e.at,e.domain,e.event,e.operationId].join('|'),e])).values()];
  if(format==='csv')return '\uFEFF'+[
    ['time','domain','event','operationId','stage','outcome','durationMs','severity','data'].map(cell).join(','),
    ...events.map(e=>[new Date(e.at).toISOString(),e.domain,e.event,e.operationId,e.stage,e.outcome,e.durationMs,e.severity,JSON.stringify(e.data||{})].map(cell).join(',')),
    ['','','REPORT_METADATA','','','','','',JSON.stringify(Object.fromEntries(Object.entries(report).filter(([key])=>!['events','critical'].includes(key))))].map(cell).join(','),
  ].join('\r\n');
  return ['# KIZILKAN Flight Recorder V7', '',`Sürüm: ${md(report.appVersion)} · ${report.events.length} olay`,
    '', '## Kayıt sistemi', '', '```json',JSON.stringify(report.writerHealth||{},null,2),'```',
    '', '## Olaylar', '', '| Zaman | Alan | Olay | İşlem | Aşama | Sonuç | Süre (ms) | Veri |',
    '|---|---|---|---|---|---|---:|---|',
    ...events.map(e=>`| ${[new Date(e.at).toISOString(),e.domain,e.event,e.operationId,e.stage,e.outcome,e.durationMs,JSON.stringify(e.data||{})].map(md).join(' | ')} |`),
    '', '## Aynı raporun diğer tanı alanları', '', '```json',
    JSON.stringify(Object.fromEntries(Object.entries(report).filter(([key])=>!['events','critical'].includes(key))),null,2),'```','',
  ].join('\n');
}
