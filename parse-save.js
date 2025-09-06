#!/usr/bin/env node

/**
 * Standalone Save File Parser
 * 
 * This script runs outside the Omegga sandbox to parse Brickadia save files
 * using our lightweight brs-js parser. It communicates with the plugin via
 * file-based communication (writes parsed data to JSON file).
 * 
 * Usage: node parse-save.js <saveFilePath> [outputPath]
 * 
 * Arguments:
 *   saveFilePath: Path to the .brs or .brdb save file
 *   outputPath:   Optional output path for parsed JSON (defaults to saveFilePath with _parsed.json)
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Usage: node parse-save.js <saveFilePath> [outputPath]');
  console.error('Example: node parse-save.js /path/to/world.brdb');
  process.exit(1);
}

const saveFilePath = args[0];
const outputPath = args[1] || saveFilePath.replace(/\.(brs|brdb)$/, '_parsed.json');

console.log(`[Parse-Save] Starting save file parsing...`);
console.log(`[Parse-Save] Input file: ${saveFilePath}`);
console.log(`[Parse-Save] Output file: ${outputPath}`);

// Validate input file exists
if (!fs.existsSync(saveFilePath)) {
  console.error(`[Parse-Save] Error: Input file does not exist: ${saveFilePath}`);
  process.exit(1);
}

// Construct path to our lightweight parser
const parserPath = path.join(__dirname, 'brs-js-lightweight', 'src', 'index.js');

// Validate parser exists
if (!fs.existsSync(parserPath)) {
  console.error(`[Parse-Save] Error: Parser script does not exist: ${parserPath}`);
  process.exit(1);
}

console.log(`[Parse-Save] Using parser: ${parserPath}`);

// Spawn the lightweight parser process
console.log(`[Parse-Save] Spawning lightweight parser process...`);
const parserProcess = spawn('node', [
  parserPath, 
  saveFilePath, 
  '--rpg-only',
  '--max-bricks', '50000',
  '--output', outputPath
], {
  stdio: ['pipe', 'pipe', 'pipe'],
  cwd: __dirname
});

let output = '';
let errorOutput = '';

// Capture stdout
parserProcess.stdout.on('data', (data) => {
  const text = data.toString();
  output += text;
  console.log(`[Parse-Save] Parser output: ${text.trim()}`);
});

// Capture stderr
parserProcess.stderr.on('data', (data) => {
  const text = data.toString();
  errorOutput += text;
  console.error(`[Parse-Save] Parser error: ${text.trim()}`);
});

// Handle process completion
parserProcess.on('close', (code) => {
  console.log(`[Parse-Save] Parser process exited with code: ${code}`);
  
  if (code === 0) {
    // Check if output file was created
    if (fs.existsSync(outputPath)) {
      try {
        const parsedData = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
        console.log(`[Parse-Save] Successfully parsed ${parsedData.bricks?.length || 0} bricks`);
        console.log(`[Parse-Save] Output written to: ${outputPath}`);
        process.exit(0);
      } catch (parseError) {
        console.error(`[Parse-Save] Error reading parsed output: ${parseError.message}`);
        process.exit(1);
      }
    } else {
      console.error(`[Parse-Save] Error: Output file was not created: ${outputPath}`);
      process.exit(1);
    }
  } else {
    console.error(`[Parse-Save] Parser process failed with exit code: ${code}`);
    if (errorOutput) {
      console.error(`[Parse-Save] Error output: ${errorOutput}`);
    }
    process.exit(1);
  }
});

// Handle process errors
parserProcess.on('error', (error) => {
  console.error(`[Parse-Save] Failed to spawn parser process: ${error.message}`);
  process.exit(1);
});

// Handle script termination
process.on('SIGINT', () => {
  console.log(`[Parse-Save] Received SIGINT, terminating parser process...`);
  parserProcess.kill('SIGINT');
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log(`[Parse-Save] Received SIGTERM, terminating parser process...`);
  parserProcess.kill('SIGTERM');
  process.exit(1);
});

console.log(`[Parse-Save] Parser process started, waiting for completion...`);
