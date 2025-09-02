#!/bin/bash

# Build script for hoopla-rpg plugin

echo "Building hoopla-rpg plugin..."

# Check if TypeScript is installed
if ! command -v tsc &> /dev/null; then
    echo "TypeScript not found. Installing..."
    npm install typescript --save-dev
fi

# Clean previous build
echo "Cleaning previous build..."
rm -rf dist/

# Build the plugin
echo "Compiling TypeScript..."
npx tsc

if [ $? -eq 0 ]; then
    echo "✅ Build successful! Plugin compiled to dist/"
    echo "You can now load the plugin in your Omegga server."
else
    echo "❌ Build failed! Check the errors above."
    exit 1
fi
