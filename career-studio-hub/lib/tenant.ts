import {AsyncLocalStorage} from 'node:async_hooks';

type TenantContext={id:string;leases:Map<string,string>};
const tenants=new AsyncLocalStorage<TenantContext>();
function validTenantId(value:unknown):value is string{return typeof value==='string'&&value.length>0&&value.length<=200&&value.trim()===value&&!/[\s\u0000-\u001f\u007f]/u.test(value);}
/** The caller supplies a verified server-side session user ID, never request body data. */
export function runWithTenant<T>(userId:string,fn:()=>T):T{if(!validTenantId(userId))throw Error('A valid authenticated user ID is required.');const current=tenants.getStore();return tenants.run(current?.id===userId?current:{id:userId,leases:new Map()},fn);}
export function requireTenantId(){const context=tenants.getStore();if(!context||!validTenantId(context.id))throw Error('Authenticated tenant context is required.');return context.id;}
export function tenantLeaseOwners(){requireTenantId();return tenants.getStore()!.leases;}
