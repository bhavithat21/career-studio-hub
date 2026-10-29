// Explicit CLI entrypoint: npx auth@latest migrate --config ./auth.config.ts
// Runtime routes use lazy getAuth() so an unconfigured build never embeds fallback secrets.
import {getAuth} from './lib/auth';
export const auth=getAuth();
