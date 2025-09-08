# Hoopla RPG - Command Registration Guide

## Overview
This document explains the complete process for adding new chat commands to the Hoopla RPG plugin. **This is critical information that must be followed every time a new command is added.**

## The Problem
When adding new commands, you might get "Command not found" errors from Omegga, even though the command handler is properly implemented in the code. This happens because **Omegga requires commands to be registered in TWO places**.

## The Solution: Two-Step Registration Process

### Step 1: Register Command Handler in Code
Add the command handler in `omegga.plugin.ts` in the `setupCommandHandlers()` method:

```typescript
// In setupCommandHandlers() method
this.omegga.on('cmd:yournewcommand', (speaker) => {
  this.handleYourNewCommand(speaker);
});
```

### Step 2: Document Command in doc.json
**CRITICAL**: Add the command to the `commands` array in `doc.json`:

```json
{
  "name": "!yournewcommand",
  "description": "Description of what the command does",
  "example": "!yournewcommand"
}
```

## Complete Example: Adding a New Command

### 1. Add Handler Method
```typescript
// In omegga.plugin.ts
private async handleYourNewCommand(speaker: string): Promise<void> {
  try {
    // Your command logic here
    this.omegga.whisper(speaker, "Command executed successfully!");
  } catch (error) {
    console.error(`[Hoopla RPG] Error in your command:`, error);
    this.omegga.whisper(speaker, "An error occurred.");
  }
}
```

### 2. Register Event Handler
```typescript
// In setupCommandHandlers() method
this.omegga.on('cmd:yournewcommand', (speaker) => {
  this.handleYourNewCommand(speaker);
});
```

### 3. Document in doc.json
```json
{
  "name": "/yournewcommand",
  "description": "Description of what the command does",
  "example": "/yournewcommand"
}
```

## Command Naming Conventions

### Event Handler Names
- Use `cmd:` prefix
- Use lowercase with underscores: `cmd:rpg_convert_bait`
- Match the command name without the `/` prefix

### JSON Documentation Names
- Use `/` prefix
- Use lowercase with underscores: `/rpg_convert_bait`
- Match the event handler name with `/` prefix

### Handler Method Names
- Use camelCase: `handleRPGConvertBait`
- Prefix with `handle`
- Match the command purpose

## Current Commands (as of latest update)

### Player Commands
- `!rpg` - Show player stats
- `!rpghelp` - Show help
- `!rpgleaderboard` - Show leaderboard
- `!rpginventory` - Show inventory
- `!mininginfo` - Mining information
- `!fishinginfo` - Fishing information

### Utility Commands
- `!rpginit` - Initialize player data
- `!rpgfixlevel` - Fix level calculation
- `!rpgcleaninventory` - Clean inventory names
- `!rpgconvertbait` - Convert old bait to new system
- `!rpgfixshopkeepers` - Fix shopkeeper triggers

### Admin Commands
- `!rpgclearall` - Clear all data
- `!rpgcleartriggers` - Clear triggers
- `!rpgclearquests` - Clear quests
- `!rpgresetquests` - Reset quest states
- `!rpgresetquestitems` - Reset quest items
- `!rpgassignlevel30roles` - Assign roles
- `!rpgcleaninventories` - Clean all inventories
- `!rpgnormalizeitems` - Normalize all items
- `!rpgadmin` - Admin command interface

## Testing New Commands

### 1. Reload Plugin
After adding a new command, reload the plugin:
```
/reload hoopla-rpg
```

### 2. Test Command
Try the command in-game:
```
!yournewcommand
```

### 3. Check Console
Look for any error messages in the console output.

## Common Mistakes

### ❌ Wrong: Only Adding Code Handler
```typescript
// This alone won't work!
this.omegga.on('cmd:newcommand', (speaker) => {
  // handler code
});
```

### ❌ Wrong: Only Adding to doc.json
```json
// This alone won't work!
{
  "name": "/newcommand",
  "description": "Description"
}
```

### ✅ Correct: Both Steps
```typescript
// Step 1: Code handler
this.omegga.on('cmd:newcommand', (speaker) => {
  this.handleNewCommand(speaker);
});
```

```json
// Step 2: Documentation
{
  "name": "/newcommand",
  "description": "Description"
}
```

## Troubleshooting

### "Command not found" Error
1. Check if command is in `doc.json`
2. Check if event handler is registered
3. Reload the plugin
4. Check console for errors

### Command Not Working
1. Check method name matches
2. Check for typos in command names
3. Verify the handler method exists
4. Check console for runtime errors

## Best Practices

1. **Always update both places** when adding commands
2. **Use consistent naming** between code and documentation
3. **Test immediately** after adding commands
4. **Document the command purpose** clearly
5. **Follow existing patterns** for consistency

## Remember
**Every time you add a new command, you MUST:**
1. Add the event handler in `setupCommandHandlers()`
2. Add the command to `doc.json`
3. Reload the plugin
4. Test the command

This process is **mandatory** and cannot be skipped!
