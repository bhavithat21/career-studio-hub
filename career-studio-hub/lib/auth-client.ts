'use client';
import {createAuthClient} from 'better-auth/react';
export const authClient=createAuthClient();
export const signInWithGoogle=()=>authClient.signIn.social({provider:'google',callbackURL:'/'});
export const signOut=()=>authClient.signOut();
export async function connectGmail(){const response=await fetch('/api/gmail/connect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({consent:true})});const result=await response.json();if(!response.ok)throw Error(result.error||'Gmail connection could not start.');if(typeof result.url!=='string')throw Error('Gmail authorization URL was not returned.');const url=new URL(result.url);if(url.protocol!=='https:'||url.hostname!=='accounts.google.com')throw Error('Unexpected Gmail authorization destination.');window.location.assign(url.href);}
