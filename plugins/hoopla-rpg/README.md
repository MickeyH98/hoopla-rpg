# omegga-hoopla-rpg

A simplified RPG plugin for Omegga that focuses on core mining gameplay with cooldown-based interactions.

**This plugin extends the currency plugin and provides streamlined RPG functionality.**
It hooks into the existing currency system and adds level, experience, inventory management, and interactive mining nodes.
Players can mine resources, gain experience, level up, and trade with shopkeepers while maintaining
full integration with the server's currency system.

## Install

`omegga install gh:MickeyH98/hoopla-rpg`

Make sure you have the `currency` plugin installed first!

## Quick Start

1. **Set up interactive bricks** with `Component_Interact` and `ConsoleTag` like:
   - `rpg_mining_iron` for iron mining nodes
   - `rpg_mining_gold` for gold mining nodes  
   - `rpg_mining_copper` for copper mining nodes
   - `rpg_sell_iron` for iron shopkeepers
   - `rpg_sell_gold` for gold shopkeepers

2. **Run `/rpginit`** to automatically detect and convert all RPG bricks

3. **Click the converted bricks** to interact with them!

## Commands

### Core RPG Commands

- **`/rpg`** - Display your current RPG stats (level, XP progress, health, currency, inventory)
- **`/rpginit`** - Initialize all RPG systems (auto-detects nodes and shopkeepers)
- **`/rpghelp`** - Show all available commands and setup instructions
- **`/rpgclearall`** - Clear all initialized RPG nodes and systems

## How It Works

### Automatic Node Detection

The plugin automatically detects RPG bricks by scanning for:
- **Component_Interact** - Makes bricks clickable
- **ConsoleTag** - Identifies the brick type (e.g., `rpg_mining_iron`)

### Mining Nodes

- **Click to mine** - Players click mining nodes to collect resources
- **Cooldown system** - Each node has a 60-second cooldown between uses
- **Resource collection** - Resources are automatically added to player inventory
- **XP rewards** - Mining grants experience points for leveling up

### Shopkeeper System

- **Click to sell** - Players click shopkeeper bricks to sell resources
- **Automatic pricing** - Resources have preset values (copper: $1, iron: $3, gold: $10)
- **Currency integration** - Sold resources convert to server currency
- **Inventory tracking** - Shows current resource counts

### Currency Integration

The plugin uses the currency plugin's API wrapper to interact with the currency system:
- **Getting Currency**: Uses `currency.getCurrency()` to retrieve player currency
- **Setting Currency**: Uses `currency.add()` to modify player currency
- **Formatting**: Uses `currency.format()` to display currency with proper formatting

### Player Progression

- **Experience System**: Players gain XP from mining and other activities
- **Leveling Up**: Every 100 XP results in a level up
- **Health Scaling**: Maximum health increases with level
- **Persistent Data**: All progress is saved between sessions

## Example Usage

### Basic RPG Commands

```
Player: /rpg
Bot: === RPG Stats ===
     Level: 2
     Experience: 150
     Level Progress: 50/100 XP (50.0%)
     Health: 110/110
     Currency: $25.00
     Inventory: 6 iron, 2 gold

Player: /rpghelp
Bot: === Available Commands ===
     /rpg - Show your RPG stats and inventory
     /rpginit - Initialize all RPG systems (auto-detects nodes/shopkeepers)
     /rpghelp - Show this help message
     /rpgclearall - Clear all initialized RPG nodes and systems

     === Setup Instructions ===
     1. Set up bricks with Component_Interact and ConsoleTag like 'rpg_mining_iron'
     2. Set up shopkeeper bricks with ConsoleTag like 'rpg_sell_copper'
     3. Run /rpginit to automatically detect and convert all RPG bricks
     4. Click on the converted bricks to interact with them!
```

### Mining Node Interactions

```
[Player clicks iron mining node]
Bot: [PlayerName] is mining node: iron_[timestamp]
     Found iron! You now have 7 iron in your inventory
     +10 XP gained! Current XP: 160

[Player clicks gold mining node]
Bot: [PlayerName] is mining node: gold_[timestamp]
     Found gold! You now have 3 gold in your inventory
     +10 XP gained! Current XP: 170
```

### Shopkeeper Interactions

```
[Player clicks iron shopkeeper]
Bot: [PlayerName] is selling to shopkeeper: iron_[timestamp]
     Successfully sold resource: iron
     +$3.00 added to your balance! New balance: $28.00
```

## Configuration

The plugin supports the following configuration options:

```yaml
startingLevel: 0          # Starting level for new players
startingHealth: 100       # Starting health for new players
experienceMultiplier: 1   # Multiplier for experience gains
healthRegenRate: 1        # Health regeneration rate
```

## Data Storage

- RPG data is stored separately from currency data using the prefix `rpg_`
- Currency data is managed entirely by the currency plugin
- The plugin maintains its own storage for RPG-specific information
- All player progress, inventory, and node interactions are persistent

## Technical Details

- Built with TypeScript for type safety
- Uses Omegga's plugin interop system for currency integration
- Implements proper error handling and validation
- Follows Omegga plugin development best practices
- Compatible with Omegga version 1.0.19+
- **Simplified Architecture**: Focuses on core functionality without complex visual systems

## Troubleshooting

If you encounter issues:

1. **Currency plugin not found**: Ensure the currency plugin is installed and loaded
2. **Commands not working**: Check that the plugin is properly loaded in your server
3. **Data not persisting**: Verify the plugin has proper storage permissions
4. **Nodes not working**: Ensure bricks have both `Component_Interact` and proper `ConsoleTag`

## Contributing

Feel free to submit issues, feature requests, or pull requests to improve the plugin!

## Recent Changes

This plugin has been significantly simplified to focus on core RPG mechanics:
- Removed complex visual brick manipulation systems
- Eliminated debug commands and excessive logging
- Streamlined to essential mining and shopkeeper functionality
- Maintains cooldown-based gameplay without visual changes
