# RPG Class System Design

## Overview
The RPG class system adds depth and specialization to the Hoopla RPG experience without affecting core player mechanics like health, movement speed, or introducing class-specific commands. Classes are differentiated through starting equipment and access to special brick node interactions.

## Core Principles
1. **No Stat Modifications**: Classes do not affect health, movement speed, or other player character properties
2. **No Class Commands**: All players use the same `/rpg` command system
3. **Equipment-Based**: Classes start with different weapons and tools
4. **Interaction-Based**: Classes gain access to special brick node types for unique gameplay
5. **Quest Integration**: Classes can access class-specific quests and storylines

## Class Definitions

### 🗡️ Warrior
**Theme**: Heavy melee combat specialist
**Starting Equipment**:
- Zweihander (two-handed sword)

**Special Interaction Bricks**:
- `rpg_warrior_boulder` - Push boulder to teleport (themed as clearing obstacles)

**Class-Specific Features**:
- Teleportation through boulder pushing
- Strength-themed interactions

### 🧙‍♂️ Mage
**Theme**: Magic and arcane knowledge specialist
**Starting Equipment**:
- Holoblade (magical weapon)

**Special Interaction Bricks**:
- `rpg_mage_portal` - Magical teleportation portals (shortcuts around the world)

**Class-Specific Features**:
- Teleportation through magical portals
- Arcane-themed interactions

### 🏴‍☠️ Pirate
**Theme**: Naval combat and treasure hunting specialist
**Starting Equipment**:
- Saber (cutlass weapon)

**Special Interaction Bricks**:
- `rpg_pirate_treasure` - RNG money rewards ($1-$500, higher amounts increasingly rare)

**Class-Specific Features**:
- Treasure hunting and money rewards
- Luck-based interactions

## Brick Interaction Categories

### 1. Special Class Interaction Bricks
**Purpose**: Provide unique gameplay mechanics and rewards per class
**Current Implementation**:
- **Warrior**: `rpg_warrior_boulder` - Teleportation through boulder pushing
- **Mage**: `rpg_mage_portal` - Teleportation through magical portals  
- **Pirate**: `rpg_pirate_treasure` - RNG money rewards ($1-$500)

**Future Expansion Ideas**:
- **Warrior**: `rpg_warrior_forge` - Weapon enhancement/repair
- **Mage**: `rpg_mage_crystal` - Temporary stat boosts or magical effects
- **Pirate**: `rpg_pirate_ship` - Access to hidden areas or special loot

### 2. Class-Specific Quest Bricks
**Purpose**: Activate quest chains that require specific classes
**Implementation**: Future expansion - quest bricks that only respond to required class
**Examples**:
- `rpg_warrior_quest` - Warrior-only quest activation
- `rpg_mage_quest` - Mage-only quest activation
- `rpg_pirate_quest` - Pirate-only quest activation

## Technical Implementation

### Class Selection System
- New players choose their class during initial setup
- Class selection is permanent (no class changing)
- Class data stored in player profile

### Class Level System
- **Replace "player level" with "class level"**
- Each class has its own level progression (Warrior Level, Mage Level, Pirate Level)
- Class levels determine access to higher-tier class interactions
- Class levels displayed in leaderboard and player stats

### Brick Node System
- Each class has access to special brick node types
- Nodes provide class-specific interactions and rewards
- Nodes are clearly marked and only interactable by appropriate class
- Higher class levels may unlock additional brick interactions

### Leaderboard Integration
- **Display player class and class level in leaderboard**
- Format: "PlayerName (Warrior L15)" or "PlayerName (Mage L12)"
- Class level contributes to overall player score/ranking
- Class-specific achievements and milestones

### Quest Integration
- Each class has 2-3 class-specific quest chains
- Class quests provide unique storylines and rewards
- Class quests integrate with existing quest system

### Equipment System
- Starting equipment is class-specific
- Equipment affects gameplay through special interactions
- Equipment can be upgraded through class-specific nodes

## Service Architecture

### RPGClassesService
- Manages class data and definitions
- Handles class selection and validation
- Provides class-specific interaction logic
- Integrates with existing quest and inventory systems

### Integration Points
- **PlayerService**: Store and retrieve class information
- **QuestService**: Provide class-specific quest chains
- **InventoryService**: Handle class-specific starting equipment
- **Main Plugin**: Route class-specific brick interactions

## Future Expansion
- Additional classes (Paladin, Druid, etc.)
- Class-specific skill trees
- Class-based team mechanics
- Class-specific achievements and titles

## Balance Considerations
- All classes have equal access to core RPG mechanics (mining, fishing, selling)
- Class differences are additive, not restrictive
- No class is inherently "better" than others
- Focus on unique gameplay experiences rather than power differences
