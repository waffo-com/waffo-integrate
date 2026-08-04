'use strict';

// Java template compile-check: assemble the Java blocks from references/java.md into a
// throwaway Maven-layout project and run `javac` against the pinned waffo-java SDK.
// Catches phantom SDK fields/methods, unhandled checked exceptions, and type errors —
// the exact class of defect (e.g. ProductInfo.productId) that static markdown hides.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { extractBlocks, FENCE } from './extract.mjs';
import { isFrameworkBlock, writeProject, run, tmpDir } from './util.mjs';

// Pinned dependency set (SDK drift => deliberate bump => this re-runs). Java config +
// service annotations need Spring; the controller (framework block) is covered too.
const POM = `<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>waffo.harness</groupId><artifactId>java-templates</artifactId><version>1.0.0</version>
  <properties>
    <maven.compiler.source>17</maven.compiler.source>
    <maven.compiler.target>17</maven.compiler.target>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
  </properties>
  <dependencies>
    <dependency><groupId>com.waffo</groupId><artifactId>waffo-java</artifactId><version>3.0.0</version></dependency>
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId><version>2.7.18</version></dependency>
    <dependency><groupId>org.junit.jupiter</groupId><artifactId>junit-jupiter</artifactId><version>5.9.1</version></dependency>
  </dependencies>
</project>`;

export async function checkJava(repoRoot) {
  const md = path.join(repoRoot, 'references', 'java.md');
  const blocks = extractBlocks(md, FENCE.java).filter((b) => b.path); // java: compile all (Spring covers config + controller)
  const dir = tmpDir('waffo-java');
  writeProject(dir, blocks); // paths already look like src/main/java/... and src/test/java/...
  fs.writeFileSync(path.join(dir, 'pom.xml'), POM);

  // Resolve the exact classpath via Maven (works in CI from Central; locally from ~/.m2 cache).
  const cpFile = path.join(dir, 'cp.txt');
  run('mvn', ['-q', '-B', 'dependency:build-classpath', `-Dmdep.outputFile=${cpFile}`], { cwd: dir });
  const cp = fs.readFileSync(cpFile, 'utf8').trim();

  const sources = listSources(path.join(dir, 'src'));
  const outDir = path.join(dir, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const res = run('javac', ['-Xmaxerrs', '200', '-d', outDir, '-cp', cp, ...sources], { cwd: dir, allowFail: true });

  return {
    lang: 'java',
    ok: res.status === 0,
    files: sources.length,
    output: res.status === 0 ? '' : res.stderr || res.stdout,
  };
}

function listSources(root) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.java')) out.push(p);
    }
  };
  if (fs.existsSync(root)) walk(root);
  return out;
}

// note: isFrameworkBlock imported for symmetry with other runners; Java compiles all blocks.
void isFrameworkBlock;
