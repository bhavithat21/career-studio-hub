import test from 'node:test';
import assert from 'node:assert/strict';
import {runnableTask,retryTask,failedTask} from '../lib/queue-state.ts';
test('automatic failures back off and stop after three attempts',()=>{
 let task={stage:'queued',attempts:0};task=failedTask(task,'Transient failure',0);
 assert.equal(runnableTask(task,29999),false);assert.equal(runnableTask(task,30000),true);
 task=failedTask(task,'Transient failure',30000);assert.equal(Date.parse(task.nextAttemptAt),90000);
 task=failedTask(task,'Transient failure',90000);assert.equal(task.stage,'failed');assert.equal(runnableTask(task,9999999),false);
});
test('review rejection waits for explicit retry or edits and retry preserves version evidence',()=>{
 const task={stage:'needs_revision',versionId:'v1',draft:'Saved source evidence',attempts:2};assert.equal(runnableTask(task),false);
 const retry=retryTask(task,100);assert.equal(retry.stage,'drafted');assert.equal(retry.versionId,'v1');assert.equal(retry.draft,task.draft);assert.equal(retry.attempts,0);assert.equal(runnableTask(retry,100),true);
});
