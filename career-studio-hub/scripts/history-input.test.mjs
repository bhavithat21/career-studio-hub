import test from 'node:test';
import assert from 'node:assert/strict';
import {validateHistoricalImport} from '../lib/history-input.ts';
const base={id:'revefi-2026-10-19',company:'Revefi',title:'Senior Backend Engineer',url:'https://jobs.lever.co/revefi/req/apply',location:'Seattle, WA',submittedAt:'2026-10-19',sourceEvidence:'Confirmed submissions section of existing tracker; employer confirmation screenshot.',pdfBase64:btoa('%PDF-1.7\nexample')};
const now=Date.parse('2026-10-28');
test('Historical input keeps exact PDF bytes and requires evidence and stable IDs',()=>{
 const value=validateHistoricalImport(base,now);assert.equal(new TextDecoder().decode(value.bytes),'%PDF-1.7\nexample');assert.equal(value.entry.submittedAt,'2026-10-19');
 assert.throws(()=>validateHistoricalImport({...base,sourceEvidence:''},now),/evidence/);
 assert.throws(()=>validateHistoricalImport({...base,id:'../file'},now),/stable/);
 assert.throws(()=>validateHistoricalImport({...base,approved:true},now),/supported fields/);
});
test('Historical input rejects script URLs, future dates, invalid and oversized PDF data',()=>{
 assert.throws(()=>validateHistoricalImport({...base,url:'javascript:alert(1)'},now),/HTTP/);
 assert.throws(()=>validateHistoricalImport({...base,url:'https://user:secret@example.com'},now),/credentials/);
 assert.throws(()=>validateHistoricalImport({...base,submittedAt:'2026-11-01'},now),/past/);
 assert.throws(()=>validateHistoricalImport({...base,pdfBase64:btoa('not a pdf')},now),/PDF/);
 assert.throws(()=>validateHistoricalImport({...base,pdfBase64:base.pdfBase64+'%'},now),/base64/);
 assert.throws(()=>validateHistoricalImport({...base,pdfBase64:'A'.repeat(2796208)},now),/2 MB/);
});
