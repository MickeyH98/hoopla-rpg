# Brick Interactions Guide

This guide explains how to use the simplified brick interaction system in the Hoopla RPG plugin.

## Overview

The plugin now supports a clean, working mining node system that allows players to:
1. **Select bricks** using the in-game selector tool
2. **Create mining nodes** with a single command
3. **Click the selected bricks** to mine resources and add them to inventory

## Commands

### Essential Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/rpg` | View your RPG stats | `/rpg` |
| `/inventory` | View your inventory | `/inventory` |
| `/miningnode <ore_type>` | Create a mining node from selected bricks | `/miningnode iron` |

## How to Set Up Mining Nodes

### Step 1: Select Bricks
1. Use the **in-game selector tool** to select the bricks you want to turn into a mining node
2. Make sure the bricks are properly selected (highlighted)

### Step 2: Create the Node
1. Run the command: `/miningnode <ore_type>`
   - Example: `/miningnode iron`
   - Example: `/miningnode gold`
   - Example: `/miningnode diamond`

### Step 3: Mine Resources
1. Click on any of the selected bricks
2. You'll receive a message: `📦 Found iron!`
3. The resource is automatically added to your inventory
4. Use `/inventory` to see your collected resources

## How It Works

### Brick Selection
- Uses `this.omegga.getSaveData()` to get selected bricks
- Automatically extracts brick positions from the selection
- Supports multiple position formats for compatibility

### Mining System
- **Type**: Item-based rewards
- **Cooldown**: 60 seconds between mining attempts
- **Inventory**: Resources are automatically added to your inventory
- **Tracking**: Node discovery is tracked for your RPG progress

### Event Handling
- Uses the `interact` event hook from Omegga
- Automatically detects when you click on mining node bricks
- Triggers the mining action and adds resources to inventory

## Console Logging

The system provides extensive console logging for debugging:

```
[Hoopla RPG] 🚀 Starting mining node creation for PlayerName with ore type: iron
[Hoopla RPG] ✅ Player found: PlayerName (player_id)
[Hoopla RPG] 🔍 Attempting to get selected bricks from player...
[Hoopla RPG] 📊 getSaveData result: {...}
[Hoopla RPG] ✅ Found 5 selected bricks
[Hoopla RPG] 🆔 Generated node ID: mining_iron_1234567890
[Hoopla RPG] 🔥 INTERACT EVENT FIRED!
[Hoopla RPG] 🎯 MATCH FOUND! Triggering action for mining_iron_1234567890
[Hoopla RPG] ✅ Successfully triggered brick action!
```

## Troubleshooting

### Common Issues

**"No bricks selected!"**
- Make sure you've selected bricks with the in-game selector tool
- Run the command immediately after selecting bricks

**"Failed to get selected bricks"**
- Ensure you're using the correct selector tool
- Try selecting the bricks again

**Brick clicks not working**
- Check the console for interaction event logs
- Verify the brick positions were extracted correctly
- Ensure the mining node was created successfully

### Debug Mode

The system automatically logs all interaction events:
- `interact` - Main brick interaction events
- `brick:interact` - Alternative brick interaction events  
- `player:interact` - Player interaction events
- `click` - General click events

## Example Workflow

1. **Select bricks**: Use selector tool to highlight 3 iron ore bricks
2. **Create node**: Type `/miningnode iron`
3. **Success message**: "✅ Created iron mining node!"
4. **Click to mine**: Click on any of the 3 selected bricks
5. **Get resource**: "📦 Found iron!" + item added to inventory
6. **Check inventory**: Use `/inventory` to see "iron: 1"
7. **Wait cooldown**: 60 seconds before mining again

## Technical Details

### Brick Position Extraction
The system handles multiple position formats:
- `brick.position` array `[x, y, z]`
- Direct properties `brick.x`, `brick.y`, `brick.z`
- Alternative arrays `brick.pos` or `brick.location`

### Storage Structure
```typescript
{
  brickTriggers: {
    "mining_iron_1234567890": {
      id: "mining_iron_1234567890",
      type: "item",
      value: 1,
      cooldown: 60000,
      message: "iron",
      triggerType: "click",
      brickPositions: [
        { x: 10, y: 5, z: 20 },
        { x: 11, y: 5, z: 20 },
        { x: 12, y: 5, z: 20 }
      ]
    }
  }
}
```

### Event Flow
1. Player selects bricks → `getSaveData()` extracts positions
2. `/miningnode` command → Creates trigger with brick positions
3. Player clicks brick → `interact` event fires
4. Position matching → Finds trigger and executes action
5. Resource reward → Adds item to inventory and shows message

This system provides a clean, intuitive way to create interactive mining nodes without complex setup commands or manual coordinate entry.
