#!/usr/bin/env node
/** Property names are not lexical captures; shorthand and computed names remain captures. */
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), assert = require('node:assert/strict');
const checker = fs.readFileSync(path.join(__dirname, 'checkdeps.js'), 'utf8');
function check(source) {
  const output = [];
  vm.runInNewContext(checker, { require: id => id === 'fs' ? { readFileSync: () => source } : require(id), process: { argv: ['node', 'checkdeps.js', 'fixture.tsx'] }, console: { log: value => output.push(String(value)) } });
  return output.filter(line => /BAYAT KAPANIŞ\s+fixture/.test(line)).length;
}
assert.equal(check('const x=useCallback(()=>scope.profileId,[]);'), 0);
assert.equal(check('const x=useMemo(()=>({watchlist:data.watchlist,hiddenItems:data.hiddenItems,profileId:scope.profileId}),[]);'), 0);
assert.equal(check('const x=useCallback(()=>activeProfile.id,[]);'), 1);
assert.equal(check('const x=useCallback(()=>({profileId}),[]);'), 1);
assert.equal(check('const x=useCallback(()=>({[profileId]:true}),[]);'), 1);
assert.equal(check('const x=useCallback(()=>activeProfile.id,[activeProfile.id]);'), 0);
console.log('PASS: checkdeps property names / shorthand / computed capture regresyonları');
