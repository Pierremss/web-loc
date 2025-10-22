#!/usr/bin/env node

import dotenv from 'dotenv';
dotenv.config();

import { pool } from '../db.js';
import { importRawgCatalog } from '../services/rawg-importer.js';

const cliOptions = parseCliOptions(process.argv.slice(2));

main().catch(async (error) => {
  console.error('Falha no importador RAWG:', error);
  await pool.end();
  process.exit(1);
});

async function main() {
  const summary = await importRawgCatalog({
    pageSize: cliOptions.pageSize,
    delayMs: cliOptions.delay,
    pages: cliOptions.pages,
    startPage: cliOptions.startPage,
    ordering: cliOptions.ordering,
    fetchDetails: parseBoolean(cliOptions.details),
    dryRun: parseBoolean(cliOptions.dryRun)
  });
  if (cliOptions.noExit !== 'true') {
    await pool.end();
  }
  console.log('\nImportação concluída:', summary);
}

function parseCliOptions(args) {
  const options = {};
  for (const arg of args) {
    if (!arg.startsWith('--')) continue;
    const [rawKey, rawValue] = arg.slice(2).split('=');
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    options[key] = rawValue === undefined ? 'true' : rawValue;
  }
  return options;
}

function parseBoolean(value) {
  if (value === undefined) return undefined;
  return value === 'true' || value === '1';
}
