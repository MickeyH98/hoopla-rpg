# omegga-hoopla-rpg

A comprehensive RPG plugin for Omegga that integrates with the currency system.

**This plugin extends the currency plugin and provides RPG functionality.**
It hooks into the existing currency system and adds level, experience, health, and inventory management.
Players can gain experience, level up, manage their health, and interact with their inventory while maintaining
full integration with the server's currency system.

## Install

`omegga install gh:yourusername/hoopla-rpg`

Make sure you have the `currency` plugin installed first!

## Usage

Configure the config options from the web panel and enjoy the RPG experience.

## Commands

### RPG System Commands

- **`/rpg`** - Display your current RPG stats (level, XP, health, currency, inventory count)
- **`/xp <amount>`** - Add experience points (default: 10 XP)
- **`/heal <amount>`** - Heal yourself (default: 20 HP)
- **`/additem <item>`** - Add an item to your inventory
- **`/removeitem <item>`** - Remove an item from your inventory
- **`/inventory`** - View your current inventory

### Currency Integration Commands

- **`/balance`** - Check your current currency balance
- **`/addmoney <amount>`** - Add money to your balance (default: 100)
- **`/spend <amount>`** - Spend money from your balance (default: 50)

### Brick Trigger Management Commands

- **`/createtrigger <id> <type> <value> <cooldown_ms> <message>`** - Create a new brick trigger
- **`/removetrigger <trigger_id>`** - Remove a brick trigger
- **`/listtriggers`** - List all available brick triggers
- **`/testtrigger <trigger_id>`** - Test a brick trigger

### Brick Interaction Setup Commands

- **`/setbrickpos <trigger_id>`** - Set brick positions for click-based triggers (manual setup required)
- **`/setregion <trigger_id> <minX> <minY> <minZ> <maxX> <maxY> <maxZ>`** - Set region bounds for area-based triggers
- **`/setproximity <trigger_id> <radius>`** - Set proximity radius for proximity-based triggers
- **`/getposition`** - Get your current position (placeholder for future implementation)

### Quick Node Creation Commands (Inspired by Mirror Plugin)

- **`/miningnode <ore_type>`** - Convert selected bricks to a mining node (e.g., `/miningnode iron`)
- **`/treasurechest <item_type>`** - Convert selected bricks to a treasure chest (e.g., `/treasurechest sword`)
- **`/healthfountain`** - Convert selected bricks to a health restoration fountain
- **`/xpnode <amount>`** - Convert selected bricks to an XP granting node (e.g., `/xpnode 25`)
- **`/nodes`** - View your discovered node collection

## Configuration

The plugin supports the following configuration options:

```yaml
startingLevel: 1          # Starting level for new players
startingHealth: 100       # Starting health for new players
experienceMultiplier: 1   # Multiplier for experience gains
healthRegenRate: 1        # Health regeneration rate
```

## How It Works

### Currency Integration

The plugin uses the currency plugin's API wrapper to interact with the currency system:

- **Getting Currency**: Uses `currency.getCurrency()` to retrieve player currency
- **Setting Currency**: Uses `currency.add()` to modify player currency
- **Formatting**: Uses `currency.format()` to display currency with proper formatting

### Brick Trigger System

The plugin includes a powerful brick trigger system that allows you to create interactive RPG elements in-game:

#### Trigger Types

- **`xp`** - Gives experience points to players
- **`currency`** - Adds currency to player balance
- **`item`** - Adds items to player inventory
- **`heal`** - Restores player health

#### Creating Triggers

Use the `/createtrigger` command to create new brick triggers:

```
/createtrigger mine_ore xp 25 5000 "Mined ore! +{value} XP"
/createtrigger shopkeeper currency 100 30000 "Welcome! Here's {value} for visiting!"
/createtrigger health_potion heal 50 60000 "Refreshed! +{value} HP restored"
/createtrigger treasure_chest item 1 120000 "Found a rare item!"
```

#### Trigger Parameters

- **`id`** - Unique identifier for the trigger
- **`type`** - Type of reward (xp, currency, item, heal)
- **`value`** - Amount of reward (XP points, currency amount, heal amount)
- **`cooldown_ms`** - Cooldown in milliseconds (prevents spam)
- **`message`** - Custom message shown to player (use {value} for dynamic values)

#### Plugin Interop

Other plugins can trigger RPG actions using the plugin interop system:

```typescript
// From another plugin
const result = await omegga.emitPlugin("hoopla-rpg", "trigger", [playerId, "mine_ore"]);
const playerData = await omegga.emitPlugin("hoopla-rpg", "getPlayerData", [playerId]);
const xpResult = await omegga.emitPlugin("hoopla-rpg", "addExperience", [playerId, 50]);
const currencyResult = await omegga.emitPlugin("hoopla-rpg", "addCurrency", [playerId, 100]);
```

#### Brick Interaction Types

The plugin supports three types of brick interactions:

**1. Click-Based Triggers** (`triggerType: 'click'`)
- Players click specific bricks to activate rewards
- Requires setting exact brick coordinates with `/setbrickpos`
- Best for: Treasure chests, interactive buttons, specific ore blocks

**2. Region-Based Triggers** (`triggerType: 'region'`)
- Players enter a defined area to activate rewards
- Set boundaries with `/setregion <minX> <minY> <minZ> <maxX> <maxY> <maxZ>`
- Best for: Mining areas, shop zones, healing stations

**3. Proximity-Based Triggers** (`triggerType: 'proximity'`)
- Players get within a certain radius of trigger points
- Set radius with `/setproximity <trigger_id> <radius>`
- Best for: NPC interactions, aura effects, gradual rewards

#### Mirror-Inspired Node Creation System

The plugin includes a powerful system inspired by the [omegga-mirror plugin](https://github.com/mraware/omegga-mirror) that allows you to convert selected bricks into interactive nodes with a single command:

**How It Works:**
1. **Select Bricks**: Use the in-game selector tool to highlight the bricks you want to convert
2. **Run Command**: Use one of the quick node creation commands
3. **Automatic Setup**: The plugin automatically extracts brick positions and creates the trigger
4. **Instant Activation**: Players can immediately click the bricks to get rewards

**Available Node Types:**
- **Mining Nodes**: Convert bricks to ore mining spots
- **Treasure Chests**: Convert bricks to item-granting chests  
- **Health Fountains**: Convert bricks to healing stations
- **XP Nodes**: Convert bricks to experience-granting spots

**Example Workflow:**
```
1. Select 3 iron ore bricks with the selector tool
2. Run: /miningnode iron
3. Plugin automatically creates: mining_iron_[timestamp]
4. Players can click those bricks to get iron resources
```

### Data Storage

- RPG data is stored separately from currency data using the prefix `rpg_`
- Currency data is managed entirely by the currency plugin
- The plugin maintains its own storage for RPG-specific information

### Node Collection System

The plugin tracks which nodes each player has discovered:

- **Automatic Tracking**: When a player interacts with any brick trigger, it's automatically added to their collection
- **Collection Display**: Use `/nodes` to see all discovered nodes organized by type
- **RPG Stats**: The `/rpg` command shows your total node discovery count
- **Persistent Storage**: Node collections are saved and persist between sessions

### Player Progression

- Players start at the configured starting level
- Experience is gained through the `/xp` command
- Every 100 XP results in a level up
- Level ups increase maximum health by 10 points
- Health is fully restored on level up

## Example Usage

### Basic RPG Commands

```
Player: /rpg
Bot: === RPG Stats ===
     Level: 1
     Experience: 0
     Level Progress: 0/100 XP (0.0%)
     Health: 100/100
     Currency: $0.00
     Inventory: 0 items

Player: /xp 150
Bot: 🎉 LEVEL UP! You are now level 2!

Player: /addmoney 500
Bot: 💰 Added $500.00 to your balance!

Player: /balance
Bot: 💰 Your balance: $500.00

Player: /spend 100
Bot: 💸 Spent $100.00! New balance: $400.00
```

### Brick Trigger System

```
Player: /createtrigger mine_ore xp 25 5000 "Mined ore! +{value} XP"
Bot: ✅ Created brick trigger: mine_ore
     Type: xp, Value: 25, Cooldown: 5000ms
     Message: Mined ore! +{value} XP

Player: /createtrigger shopkeeper currency 100 30000 "Welcome! Here's {value} for visiting!"
Bot: ✅ Created brick trigger: shopkeeper
     Type: currency, Value: 100, Cooldown: 30000ms
     Message: Welcome! Here's {value} for visiting!

Player: /listtriggers
Bot: 📋 Brick Triggers:
     mine_ore: xp (25) - Mined ore! +{value} XP
     shopkeeper: currency (100) - Welcome! Here's {value} for visiting!

Player: /testtrigger mine_ore
Bot: ✅ Mined ore! +25 XP
     Reward: {"type":"xp","amount":25,"leveledUp":false,"newLevel":1}
```

### Brick Interaction Setup Examples

```
# Set up a mining area (region-based)
Player: /setregion mine_area 0 0 0 10 10 10
Bot: ✅ Set region bounds for trigger: mine_area
     Trigger type: Region-based (enter area to activate)
     Bounds: (0,0,0) to (10,10,10)

# Set up a proximity trigger for an NPC
Player: /setproximity shopkeeper 3
Bot: ✅ Set proximity trigger for: shopkeeper
     Trigger type: Proximity-based (within 3 blocks)
     Note: You still need to set brick positions with /setbrickpos!

# Create a health fountain (region-based)
Player: /createtrigger health_fountain heal 50 60000 "Refreshed! +{value} HP restored"
Player: /setregion health_fountain 20 20 20 25 25 25
Bot: ✅ Set region bounds for trigger: health_fountain
     Trigger type: Region-based (enter area to activate)
     Bounds: (20,20,20) to (25,25,25)
```

### Automatic XP System

Every minute, all online players automatically receive 10 XP:

```
Bot: +10 XP gained! Current XP: 35
     Level 1 Progress: 35/100 XP (35.0%)
```

### Node Collection Examples

```
Player: /nodes
Bot: 🔮 Your Node Collection (3 discovered):
     XP Nodes:
       • mine_ore
       • xp_fountain
     Currency Nodes:
       • shopkeeper

Player: /rpg
Bot: === RPG Stats ===
     Level: 2
     Experience: 150
     Level Progress: 50/100 XP (50.0%)
     Health: 110/110
     Currency: $250.00
     Inventory: 2 items
     Nodes Discovered: 3
```

### Node Creation Notifications

When creating new nodes, all players are notified:

```
Player: /createtrigger treasure_chest item 1 120000 "Found a rare item!"
Bot: ✅ Created brick trigger: treasure_chest
     Type: item, Value: 1, Cooldown: 120000ms
     Message: Found a rare item!

[Broadcast to all players]
🔮 New Item Node discovered: treasure_chest by PlayerName!
Players can now interact with this node to get rewards!
```

## Dependencies

This plugin requires the `currency` plugin to be installed and loaded. The plugin will automatically attempt to connect to the currency system on initialization.

## Technical Details

- Built with TypeScript for type safety
- Uses Omegga's plugin interop system for currency integration
- Implements proper error handling and validation
- Follows Omegga plugin development best practices
- Compatible with Omegga version 1.0.19+

## Troubleshooting

If you encounter issues:

1. **Currency plugin not found**: Ensure the currency plugin is installed and loaded
2. **Commands not working**: Check that the plugin is properly loaded in your server
3. **Data not persisting**: Verify the plugin has proper storage permissions

## Contributing

Feel free to submit issues, feature requests, or pull requests to improve the plugin!
