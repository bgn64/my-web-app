import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { manyStats, minimalStats, sampleStats, sampleTotals, scoringExamples } from "../app/mockups/scoring-examples.ts";

const require = createRequire(import.meta.url);

function loadProxy(mode)
{
	const compiledModule = { exports: {} };
	const source = readFileSync(new URL("../proxy.ts", import.meta.url), "utf8");
	const { outputText } = ts.transpileModule(source, {
		compilerOptions: {
			module: ts.ModuleKind.CommonJS,
			target: ts.ScriptTarget.ES2022,
		},
	});

	runInNewContext(outputText, {
		module: compiledModule,
		exports: compiledModule.exports,
		require,
		process: {
			env: mode === undefined ? {} : { APP_ENV: mode },
		},
	});

	return compiledModule.exports;
}

test("mockups are unavailable unless the runtime mode is explicitly development", async () =>
{
	for (const mode of [undefined, "", "production", "staging", "Development"])
	{
		const { proxy, config } = loadProxy(mode);
		const response = proxy();
		assert.equal(config.matcher, "/mockups/:path*");
		assert.equal(response.status, 404);
		assert.equal(await response.text(), "Not Found");
		assert.equal(response.headers.get("cache-control"), "no-store");
	}

	const response = loadProxy("development").proxy();
	assert.equal(response.headers.get("x-middleware-next"), "1");
});

test("gallery retains original screens and adds sparse-stat minimal alternatives", () =>
{
	assert.deepEqual(scoringExamples.map((example) => example.slug), [
		"minimal-styled",
		"minimal", "minimal-empty", "minimal-one",
		"recording", "editing", "search", "create-dialog", "totals", "empty", "many",
	]);
	assert.equal(minimalStats.minimal.length, 3);
	assert.deepEqual(minimalStats["minimal-styled"], minimalStats.minimal);
	assert.equal(minimalStats["minimal-empty"].length, 0);
	assert.equal(minimalStats["minimal-one"].length, 1);
	assert.equal(new Set(scoringExamples.map((example) => example.slug)).size, scoringExamples.length);
	assert.equal(manyStats.length, 50);
	assert.equal(new Set(manyStats.map((stat) => stat.id)).size, 50);
	assert.ok(manyStats.some((stat) => stat.name.length > 60));
	assert.equal(sampleStats[1].values.find((value) => value.hole === 4).value, false);
	assert.equal(sampleStats[2].values.some((value) => value.hole === 4), false);
	assert.deepEqual(sampleTotals.map((stat) => stat.value), ["7", "2 / 4", "1"]);
});

test("mockup modules depend only on their own files and framework packages", () =>
{
	const root = new URL("../app/mockups/", import.meta.url);

	function checkDirectory(directory)
	{
		for (const entry of readdirSync(directory, { withFileTypes: true }))
		{
			if (entry.isDirectory())
			{
				checkDirectory(new URL(`${entry.name}/`, directory));
				continue;
			}

			if (!/\.tsx?$/.test(entry.name))
			{
				continue;
			}

			const file = new URL(entry.name, directory);
			const source = ts.createSourceFile(entry.name, readFileSync(file, "utf8"), ts.ScriptTarget.Latest);

			for (const statement of source.statements)
			{
				if (!ts.isImportDeclaration(statement))
				{
					continue;
				}

				const specifier = statement.moduleSpecifier.text;

				if (!specifier.startsWith("."))
				{
					assert.ok(specifier === "react" || specifier === "next" || specifier.startsWith("next/"));
					continue;
				}

				const resolved = new URL(specifier, file);
				assert.ok(resolved.href.startsWith(root.href), `${file.href} imports outside mockups: ${specifier}`);
				assert.ok(["", ".ts", ".tsx"].some((extension) => existsSync(new URL(resolved.href + extension))));
			}
		}
	}

	checkDirectory(root);
});
