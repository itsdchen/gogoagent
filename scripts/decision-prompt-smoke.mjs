#!/usr/bin/env node
import assert from 'node:assert/strict'
import { decisionPromptFromLog, decisionQuestion } from '../services/sidecar/src/lib/decisionPrompt.ts'

const first = decisionPromptFromLog('Working on the feature.\nApprove this command?\n1. Yes, run it\n2. No, cancel\nEnter choice:')
assert.deepEqual(first.choices.map((choice) => choice.value), ['1', '2'])
assert.match(first.excerpt, /Approve this command/)
assert.equal(decisionQuestion(first), 'Approve this command?')

const changed = decisionPromptFromLog('Working on the feature.\nApprove a different command?\n1. Yes, run it\n2. No, cancel\nEnter choice:')
assert.notEqual(changed.id, first.id, 'a changed prompt invalidates rendered buttons')

const stale = decisionPromptFromLog('Earlier plan:\n1. Edit files\n2. Run tests\nThe agent is now asking about another action.')
assert.equal(stale.choices.length, 0, 'numbered plans must not become approval buttons')
assert.equal(decisionQuestion(stale), undefined, 'an unrelated line must not become an invented question')
assert.equal(decisionQuestion(decisionPromptFromLog('Old request?\nThe agent finished that request.\nWorking on a new step.\nChoose one:')), undefined, 'an older question must not appear as the current inbox preview')

const binary = decisionPromptFromLog('Allow the operation? [y/n]')
assert.deepEqual(binary.choices.map((choice) => choice.value), ['y', 'n'])

console.log('Decision prompt checks passed')
