# brs-js-lightweight

A lightweight version of brs-js optimized for RPG plugins. Based on the original brs-js but with only the essential brick properties needed for RPG functionality.

## Features

- **Memory Efficient**: Only parses essential brick properties
- **RPG Focused**: Optimized for detecting RPG interactive components
- **No Array Size Issues**: Processes bricks in chunks with garbage collection
- **Lightweight**: Minimal memory footprint compared to full brs-js

## Installation

```bash
cd brs-js-lightweight
npm install
```

## Usage

### Node.js

```javascript
const { parseSaveFile, parseRpgBricks } = require('./src/index.js');

// Parse all bricks
const saveData = parseSaveFile('world.brdb', {
  maxBricks: 1000,  // Limit for memory management
  rpgOnly: false    // Include all bricks
});

// Parse only RPG bricks
const rpgData = parseRpgBricks('world.brdb', {
  maxBricks: 1000   // Limit for memory management
});
```

### Command Line

```bash
# Parse all bricks
node src/index.js world.brdb

# Parse only RPG bricks
node src/index.js world.brdb --rpg-only

# Limit number of bricks processed
node src/index.js world.brdb --max-bricks 5000

# Disable garbage collection
node src/index.js world.brdb --no-gc
```

## Brick Object Structure

The lightweight brick object only includes essential properties:

```javascript
{
  position: [x, y, z],           // Brick position
  size: [width, height, depth],  // Brick size
  asset_name_index: number,      // Asset index
  components: {                  // Only RPG-relevant components
    Component_Interact: {
      ConsoleTag: "rpg_mining_iron"  // RPG console tag
    }
  }
}
```

## RPG Component Detection

The parser automatically detects bricks with RPG components by looking for:
- `Component_Interact` components
- `ConsoleTag` properties starting with `rpg_`

Examples of detected RPG console tags:
- `rpg_mining_iron`
- `rpg_mining_gold`
- `rpg_fishing_spot`
- `rpg_shopkeeper`

## Memory Management

- Processes bricks in chunks of 1000
- Forces garbage collection every 1000 bricks
- Skips unnecessary data sections
- Only parses essential brick properties

## Integration with Omegga Plugins

This lightweight parser is designed to be used by Omegga plugins that need to process large save files without running into memory limitations.

## Differences from brs-js

- **Reduced Properties**: Only essential brick properties
- **RPG Focus**: Optimized for RPG component detection
- **Memory Management**: Built-in garbage collection and chunking
- **No Write Support**: Read-only parser
- **Simplified API**: Focused on RPG use cases

## License

MIT
