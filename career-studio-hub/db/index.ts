import {Pool} from 'pg';
let pool:Pool|undefined;
/** Lazy initialization keeps builds independent of deployment credentials. */
export function getDb(){if(!process.env.DATABASE_URL)throw Error('Online Postgres database is not configured.');if(!pool)pool=new Pool({connectionString:process.env.DATABASE_URL,max:5,idleTimeoutMillis:10000,connectionTimeoutMillis:10000});return pool;}
