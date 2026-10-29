import {withAuthenticatedTenant,RequestAccessError} from '../../../lib/auth';
import {getLegacyMigrationStatus,startLegacyMigration,stepLegacyMigration,reviewLegacyMigration,finishLegacyMigration} from '../../../lib/legacy-migration-run';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=300;
const json=(value:unknown)=>Response.json(value,{headers:{'Cache-Control':'private, no-store'}});
export const GET=(req:Request)=>withAuthenticatedTenant(req,async()=>json(await getLegacyMigrationStatus()));
export const POST=(req:Request)=>withAuthenticatedTenant(req,async()=>{const input=await req.json().catch(()=>null);if(!input||typeof input.action!=='string')throw new RequestAccessError('Invalid migration action.',400);if(input.action==='start')return json(await startLegacyMigration());if(input.action==='step')return json(await stepLegacyMigration());if(input.action==='review')return json(await reviewLegacyMigration());if(input.action==='commit')return json(await finishLegacyMigration(input));throw new RequestAccessError('Unknown migration action.',400);});
