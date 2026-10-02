// Standalone semantic probes use real TypeScript and its standard libraries.
// The root fixture is in memory; diagnostics are never filtered by platform path spelling.
const path = require('path');
const ts = require('./_ts');
function compileFixture(source, fileName = path.join(__dirname, '__semantic_fixture__.ts')) {
  const normalized = String(fileName).replace(/\\/g, '/');
  const canonical = name => {
    const text = String(name).replace(/\\/g, '/');
    return ts.sys.useCaseSensitiveFileNames ? text : text.toLowerCase();
  };
  const options = { strict: true, noEmit: true, target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.CommonJS, skipLibCheck: true, types: [] };
  const host = ts.createCompilerHost(options);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (name, languageVersion, onError, shouldCreateNewSourceFile) =>
    canonical(name) === canonical(normalized)
      ? ts.createSourceFile(normalized, source, languageVersion, true, ts.ScriptKind.TS)
      : originalGetSourceFile(name, languageVersion, onError, shouldCreateNewSourceFile);
  const program = ts.createProgram([normalized], options, host);
  return ts.getPreEmitDiagnostics(program);
}
function formatDiagnostic(diagnostic) {
  const position = diagnostic.file && diagnostic.start != null
    ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start) : null;
  return `HATA TS${diagnostic.code}${position ? ` ${position.line + 1}:${position.character + 1}` : ''} — ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`;
}
module.exports = { compileFixture, formatDiagnostic };
