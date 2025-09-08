# Hoopla RPG - Naming Standards Documentation

## Overview
This document outlines the naming standards for all in-game items, messages, and displays in the Hoopla RPG system.

## Item Display Standards

### 1. Capitalization Rules
All item names displayed in-game must follow proper capitalization:
- **Each word** in the item name should be capitalized
- **First letter** of each word should be uppercase
- **Remaining letters** should be lowercase

#### Examples:
- ✅ `Sea Dragon` (not `sea dragon`)
- ✅ `Brickingway Box` (not `brickingway box`)
- ✅ `Copper Ore` (not `copper ore`)
- ✅ `Arctic Char` (not `arctic char`)

### 2. Internal Logic vs Display Pattern
**CRITICAL**: Always use lowercase for internal logic but proper capitalization for display:

#### Internal Logic (Lowercase):
- Item comparisons: `item.toLowerCase() === requirement.target.toLowerCase()`
- Fish type checks: `fishType.toLowerCase()`
- Inventory lookups: `player.inventory.filter(item => item.toLowerCase() === target.toLowerCase())`
- Database storage: Store as lowercase for consistency

#### Display (Proper Capitalization):
- All in-game messages: `Sea Dragon`, `Copper Ore`, `Brickingway Box`
- Inventory displays: `[Sea Dragon]`, `[Copper Ore]`
- Chat messages: `Caught 1 [Sea Dragon]!`
- Quest progress: `You collected [Brickingway Box]!`

#### Why This Pattern?
- **Consistency**: Internal logic always works regardless of how items are stored
- **User Experience**: Players see properly formatted names
- **Maintenance**: Easy to add new items without worrying about case variations

### 2. Rarity Color Standards
All items must display with their appropriate rarity color using the `<color="hexcode">` format:

#### Rarity Colors:
- **Common**: `<color="fff">` (White)
- **Uncommon**: `<color="0f0">` (Green)
- **Rare**: `<color="00f">` (Blue)
- **Epic**: `<color="f0f">` (Purple)
- **Legendary**: `<color="f80">` (Orange)

#### Display Format:
```
<color="rarity_color">[Item Name]</color>
```

#### Examples:
- `<color="fff">[Gup]</color>` - Common fish
- `<color="0f0">[Cod]</color>` - Uncommon fish
- `<color="00f">[Lionfish]</color>` - Rare fish
- `<color="f0f">[Manta Ray]</color>` - Epic fish
- `<color="f80">[Sea Dragon]</color>` - Legendary fish

### 3. Message Format Standards

#### Fishing Messages:
```
Caught 1 <color="rarity_color">[Fish Name]</color> (<color="ff0">x{count}</color> in bag), Gained {xp}XP and {fishingXP} Fishing XP - {attempts} attempts remaining
```

#### Mining Messages:
```
Mined 1 <color="rarity_color">[Ore Name]</color> (<color="ff0">x{count}</color> in bag), Gained {xp}XP and {miningXP} Mining XP
```

#### Quest Item Messages:
```
You collected <color="rarity_color">[Item Name]</color>! Progress: <color="0f0">{current}</color>/<color="ff0">{required}</color> (<color="f00">{remaining}</color> remaining)
```

### 4. Implementation Guidelines

#### For Developers:
1. **Always use** the `formatFishName()` method in `FishingService` for fish names
2. **Always use** the `normalizeItemName()` method in the main plugin for general items
3. **Always use** `getResourceColor()` from `ResourceService` for rarity colors
4. **Always use lowercase** for internal logic and comparisons
5. **Always use proper capitalization** for display messages
6. **Test** all item displays to ensure proper capitalization and colors

#### Code Examples:

```typescript
// ✅ Correct - Internal logic (lowercase)
const canCatch = fishType.toLowerCase() === 'sea dragon';
const itemCount = player.inventory.filter(item => item.toLowerCase() === target.toLowerCase()).length;
const isMatch = item.toLowerCase() === requirement.target.toLowerCase();

// ✅ Correct - Display (proper capitalization)
const formattedFishName = this.formatFishName(fishType); // "sea dragon" -> "Sea Dragon"
const fishColor = this.resourceService.getResourceColor(fishType);
const message = `Caught 1 <color="${fishColor}">[${formattedFishName}]</color>!`;

// ✅ Correct - General items
const normalizedItemName = this.normalizeItemName(itemType);
const itemColor = this.resourceService.getResourceColor(normalizedItemName);
const message = `You collected <color="${itemColor}">[${normalizedItemName}]</color>!`;

// ❌ Incorrect - Raw names without formatting
const message = `Caught 1 <color="fff">[${fishType}]</color>!`; // No capitalization
const message = `Caught 1 [${fishType}]</color>!`; // No color

// ❌ Incorrect - Mixed case in logic
const canCatch = fishType === 'Sea Dragon'; // Should be lowercase comparison
const itemCount = player.inventory.filter(item => item === 'Copper Ore').length; // Should be lowercase
```

### 5. Consistency Checklist

Before implementing any new item display:
- [ ] Item name is properly capitalized for display
- [ ] Internal logic uses lowercase comparisons
- [ ] Rarity color is applied correctly
- [ ] Message format follows established patterns
- [ ] Color codes are valid hex values
- [ ] Brackets `[]` are used around item names
- [ ] Count displays use `<color="ff0">x{count}</color>` format
- [ ] All item comparisons use `.toLowerCase()`
- [ ] Display messages use formatted names (not raw internal names)

### 6. Common Mistakes to Avoid

- ❌ Using raw item names without capitalization in display messages
- ❌ Using proper capitalization in internal logic comparisons
- ❌ Missing rarity colors on item displays
- ❌ Inconsistent bracket usage around item names
- ❌ Wrong color codes for rarity levels
- ❌ Inconsistent message formatting across different systems
- ❌ Storing items with mixed case in inventory (should be consistent)
- ❌ Forgetting to use `.toLowerCase()` in item comparisons
- ❌ Displaying internal item names instead of formatted display names

## Maintenance

This document should be updated whenever:
- New item types are added
- New rarity levels are introduced
- Message formats are changed
- New display methods are implemented

---

**Last Updated**: January 2025
**Version**: 1.0
